use drone_sim::atmosphere::G0;
use drone_sim::{AirframeModel, Quat, RigidState, SimConfig, Simulator, Turbulence, Vec3};

fn model() -> AirframeModel {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../hardware/generated/palm_x4_2in/airframe_model.json"
    );
    serde_json::from_str(&std::fs::read_to_string(path).expect("test fixture"))
        .expect("test fixture")
}

fn sea_level() -> SimConfig {
    SimConfig {
        site_altitude_m: 0.0,
        temperature_c: 15.0,
        ..SimConfig::default()
    }
}

fn in_air(sim: &mut Simulator, height: f64, rates: Vec3) {
    sim.set_state_for_test(RigidState {
        position: Vec3::new(0.0, 0.0, -height),
        velocity: Vec3::ZERO,
        attitude: Quat::from_euler(0.1, -0.2, 0.3),
        rates,
    });
}

#[test]
fn free_fall_matches_gravity() {
    let mut m = model();
    m.aerodynamics.drag_area_m2 = [0.0; 3];
    let mut sim = Simulator::new(&m, &sea_level());
    in_air(&mut sim, 50.0, Vec3::ZERO);
    for _ in 0..2000 {
        sim.step([0.0; 4]);
    }
    let t = sim.truth();
    assert!((t.velocity_mps.z - G0).abs() < 1e-9, "{}", t.velocity_mps.z);
    assert!((t.position_m.z - (-50.0 + 0.5 * G0)).abs() < 1e-9);
}

#[test]
fn torque_free_rotation_conserves_energy_and_momentum() {
    let mut m = model();
    m.aerodynamics.drag_area_m2 = [0.0; 3];
    let mut sim = Simulator::new(&m, &sea_level());
    in_air(&mut sim, 1000.0, Vec3::new(3.0, -5.0, 8.0));
    let e0 = sim.kinetic_energy();
    let inertia = drone_sim::Mat3::new(m.inertia_kg_m2);
    let momentum = |s: &Simulator| s.state().attitude.rotate(inertia.mul_vec(s.state().rates));
    let l0 = momentum(&sim);
    let mut worst_norm: f64 = 0.0;
    for _ in 0..20_000 {
        sim.step([0.0; 4]);
        worst_norm = worst_norm.max((sim.state().attitude.norm() - 1.0).abs());
    }
    let rot_energy = |s: &Simulator| 0.5 * s.state().rates.dot(inertia.mul_vec(s.state().rates));
    let e1 = rot_energy(&sim);
    assert!(
        ((e1 - e0) / e0).abs() < 1e-6,
        "energy drift {}",
        (e1 - e0) / e0
    );
    let l1 = momentum(&sim);
    assert!((l1 - l0).norm() / l0.norm() < 1e-6);
    assert!(worst_norm < 1e-12, "quaternion norm error {worst_norm}");
}

#[test]
fn hover_omega_balances_weight() {
    let m = model();
    let mut sim = Simulator::new(&m, &sea_level());
    sim.set_rotor_omega_for_test([m.derived.hover_omega_rad_s; 4]);
    sim.set_state_for_test(RigidState {
        position: Vec3::new(0.0, 0.0, -20.0),
        ..RigidState::default()
    });
    let t = sim.truth();
    assert!(
        t.acceleration_mps2.z.abs() < 1e-3,
        "{}",
        t.acceleration_mps2.z
    );
}

#[test]
fn ground_contact_is_stable_after_a_drop() {
    let m = model();
    let mut sim = Simulator::new(&m, &sea_level());
    sim.set_state_for_test(RigidState {
        position: Vec3::new(0.0, 0.0, -0.3),
        ..RigidState::default()
    });
    let start = sim.kinetic_energy() + sim.potential_energy();
    let mut touched = false;
    for _ in 0..6000 {
        sim.step([0.0; 4]);
        let t = sim.truth();
        touched |= t.on_ground;
        if touched {
            assert!(
                t.height_agl_m < 0.25,
                "bounced back to {} m",
                t.height_agl_m
            );
            assert!(sim.kinetic_energy() + sim.potential_energy() < start);
        }
    }
    let t = sim.truth();
    assert!(t.on_ground);
    assert!(t.velocity_mps.norm() < 1e-3, "{:?}", t.velocity_mps);
    assert!(
        t.height_agl_m > -0.003 && t.height_agl_m < 0.0,
        "penetration {}",
        t.height_agl_m
    );
    assert!(t.euler_rad.x.abs() < 1e-3 && t.euler_rad.y.abs() < 1e-3);
}

#[test]
fn full_throttle_sags_the_battery_and_lifts_off() {
    let m = model();
    let mut sim = Simulator::new(&m, &sea_level());
    let rest = sim.truth().battery_v;
    for _ in 0..1000 {
        sim.step([1.0; 4]);
    }
    let t = sim.truth();
    assert!(rest - t.battery_v > 0.8, "sag {}", rest - t.battery_v);
    assert!(t.battery_current_a > 15.0);
    assert!(t.height_agl_m > 0.1 && t.velocity_mps.z < 0.0);
}

fn run_trace(seed: u64) -> Vec<u64> {
    let m = model();
    let config = SimConfig {
        seed,
        turbulence: Turbulence::Moderate,
        ..SimConfig::default()
    };
    let mut sim = Simulator::new(&m, &config);
    let mut trace = Vec::new();
    for i in 0..10_000u32 {
        let c = 0.5 + 0.1 * f64::from(i % 97) / 97.0;
        sim.step([c, c * 0.99, c * 1.01, c]);
        let t = sim.truth();
        let s = sim.sensors();
        trace.push(
            t.position_m.x.to_bits()
                ^ t.attitude.y.to_bits().rotate_left(7)
                ^ t.battery_v.to_bits().rotate_left(13),
        );
        trace.push(
            u64::from(s.imu.gyro_raw[0] as u16)
                | (u64::from(s.imu.accel_raw[2] as u16) << 16)
                | (s.baro.pressure_pa.to_bits() << 32),
        );
    }
    trace
}

#[test]
fn identical_seed_gives_bit_identical_trajectories() {
    let a = run_trace(42);
    let b = run_trace(42);
    assert_eq!(a, b);
    assert_ne!(a, run_trace(43));
}
