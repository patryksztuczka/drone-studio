use serde::{Deserialize, Serialize};

use crate::atmosphere::{AirState, Atmosphere, G0};
use crate::battery::Battery;
use crate::math::{Mat3, Quat, Vec3};
use crate::model::AirframeModel;
use crate::propulsion::{
    RotorState, advance_rotor, ground_effect_factor, thrust_constant, torque_constant,
};
use crate::rng::Rng;
use crate::sensors::{AdcSim, BaroSim, ImuSim, ImuTruth, SensorFrame, VibrationInput};
use crate::wind::{Gust, Turbulence, WindField};

const CONTACT_STIFFNESS: f64 = 400.0;
const CONTACT_DAMPING: f64 = 4.0;
const FRICTION_COEFFICIENT: f64 = 0.6;
const FRICTION_VISCOUS: f64 = 8.0;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SimConfig {
    pub seed: u64,
    pub site_altitude_m: f64,
    pub temperature_c: f64,
    pub initial_position_m: [f64; 3],
    pub initial_yaw_rad: f64,
    pub battery_soc: f64,
    pub steady_wind_mps: [f64; 3],
    pub turbulence: Turbulence,
    pub gusts: Vec<Gust>,
}

impl Default for SimConfig {
    fn default() -> Self {
        Self {
            seed: 0,
            site_altitude_m: 100.0,
            temperature_c: 20.0,
            initial_position_m: [0.0; 3],
            initial_yaw_rad: 0.0,
            battery_soc: 1.0,
            steady_wind_mps: [0.0; 3],
            turbulence: Turbulence::None,
            gusts: Vec::new(),
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct RigidState {
    pub position: Vec3,
    pub velocity: Vec3,
    pub attitude: Quat,
    pub rates: Vec3,
}

#[derive(Clone, Copy, Debug, Default)]
struct Derivative {
    velocity: Vec3,
    acceleration: Vec3,
    attitude: Quat,
    angular_acceleration: Vec3,
    contact_force: f64,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Truth {
    pub time_s: f64,
    pub position_m: Vec3,
    pub velocity_mps: Vec3,
    pub acceleration_mps2: Vec3,
    pub attitude: Quat,
    pub euler_rad: Vec3,
    pub rates_rad_s: Vec3,
    pub rotor_omega: [f64; 4],
    pub rotor_thrust_n: [f64; 4],
    pub rotor_current_a: [f64; 4],
    pub motor_command: [f64; 4],
    pub battery_v: f64,
    pub battery_current_a: f64,
    pub battery_soc: f64,
    pub consumed_mah: f64,
    pub wind_mps: Vec3,
    pub contact_force_n: f64,
    pub on_ground: bool,
    pub height_agl_m: f64,
}

#[derive(Clone, Debug)]
pub struct Simulator {
    model: AirframeModel,
    dt: f64,
    step_count: u64,
    state: RigidState,
    inertia: Mat3,
    inertia_inv: Mat3,
    rotors: [RotorState; 4],
    rotor_positions: [Vec3; 4],
    rotor_spin: [f64; 4],
    landing_points: Vec<Vec3>,
    thrust_scale: [f64; 4],
    battery: Battery,
    atmosphere: Atmosphere,
    site_altitude_m: f64,
    air: AirState,
    wind: WindField,
    wind_now: Vec3,
    imu: ImuSim,
    baro: BaroSim,
    adc: AdcSim,
    last_derivative: Derivative,
    imu_position: Vec3,
    k_thrust: f64,
    k_torque: f64,
    rotor_alpha: f64,
    air_altitude_m: f64,
}

fn rotor_array(model: &AirframeModel) -> ([Vec3; 4], [f64; 4]) {
    let mut pos = [Vec3::ZERO; 4];
    let mut spin = [0.0; 4];
    for (i, r) in model.rotors.iter().take(4).enumerate() {
        pos[i] = Vec3::from_array(r.position_m);
        spin[i] = r.spin.sign();
    }
    (pos, spin)
}

impl Simulator {
    pub fn new(model: &AirframeModel, config: &SimConfig) -> Self {
        let dt = 1.0 / f64::from(model.rates.physics_hz);
        let mut rng = Rng::new(config.seed);
        let inertia = Mat3::new(model.inertia_kg_m2);
        let inertia_inv = inertia.inverse().unwrap_or(Mat3::IDENTITY);
        let (rotor_positions, rotor_spin) = rotor_array(model);
        let landing_points: Vec<Vec3> = model
            .landing_points_m
            .iter()
            .map(|p| Vec3::from_array(*p))
            .collect();
        let lowest = landing_points.iter().map(|p| p.z).fold(0.0, f64::max);
        let start = Vec3::from_array(config.initial_position_m);
        let atmosphere = Atmosphere::new(config.site_altitude_m, config.temperature_c);
        let wind = WindField::new(
            Vec3::from_array(config.steady_wind_mps),
            config.gusts.clone(),
            config.turbulence,
            rng.fork(1),
        );
        let state = RigidState {
            position: Vec3::new(start.x, start.y, start.z.min(0.0) - lowest),
            velocity: Vec3::ZERO,
            attitude: Quat::from_euler(0.0, 0.0, config.initial_yaw_rad),
            rates: Vec3::ZERO,
        };
        let mut sim = Self {
            model: model.clone(),
            dt,
            step_count: 0,
            state,
            inertia,
            inertia_inv,
            rotors: [RotorState::default(); 4],
            rotor_positions,
            rotor_spin,
            landing_points,
            thrust_scale: [1.0; 4],
            battery: Battery::new(&model.battery, config.battery_soc),
            atmosphere,
            site_altitude_m: config.site_altitude_m,
            air: atmosphere.at(config.site_altitude_m),
            wind,
            wind_now: Vec3::ZERO,
            imu: ImuSim::new(&model.imu, &model.vibration, dt, rng.fork(2)),
            baro: BaroSim::new(&model.baro, dt, rng.fork(3)),
            adc: AdcSim::new(&model.adc, rng.fork(4)),
            last_derivative: Derivative::default(),
            imu_position: Vec3::from_array(model.imu.position_m),
            k_thrust: 0.0,
            k_torque: 0.0,
            rotor_alpha: 1.0 - libm::exp(-dt / model.motor.time_constant_s),
            air_altitude_m: config.site_altitude_m,
        };
        sim.update_air();
        sim.settle_on_ground();
        sim
    }

    fn settle_on_ground(&mut self) {
        let weight = self.model.mass_kg * G0;
        let n = self.landing_points.len().max(1) as f64;
        if self.state.position.z + self.landing_points.iter().map(|p| p.z).fold(0.0, f64::max)
            >= -1e-9
        {
            self.state.position.z += weight / (n * CONTACT_STIFFNESS);
        }
        self.last_derivative = self.derivative(&self.state);
        self.sample_sensors();
    }

    pub fn model(&self) -> &AirframeModel {
        &self.model
    }

    pub fn dt(&self) -> f64 {
        self.dt
    }

    pub fn time_s(&self) -> f64 {
        self.step_count as f64 * self.dt
    }

    pub fn time_us(&self) -> u64 {
        self.step_count * 1_000_000 / u64::from(self.model.rates.physics_hz)
    }

    pub fn state(&self) -> &RigidState {
        &self.state
    }

    pub fn set_thrust_scale(&mut self, rotor: usize, scale: f64) {
        if let Some(s) = self.thrust_scale.get_mut(rotor) {
            *s = scale.clamp(0.0, 1.0);
        }
    }

    pub fn set_gyro_bias_fault(&mut self, bias_dps: Vec3) {
        self.imu.injected_gyro_bias_dps = bias_dps;
    }

    pub fn gust_active(&self) -> bool {
        self.wind.gust_active(self.time_s())
    }

    fn rotor_height(&self, s: &RigidState, i: usize) -> f64 {
        -(s.position + s.attitude.rotate(self.rotor_positions[i])).z
    }

    fn update_air(&mut self) {
        let altitude = self.site_altitude_m - self.state.position.z;
        if self.k_thrust > 0.0 && (altitude - self.air_altitude_m).abs() < 0.05 {
            return;
        }
        self.air_altitude_m = altitude;
        self.air = self.atmosphere.at(altitude);
        self.k_thrust = thrust_constant(&self.model.prop, self.air.density_kg_m3);
        self.k_torque = torque_constant(&self.model.prop, self.air.density_kg_m3);
    }

    fn derivative(&self, s: &RigidState) -> Derivative {
        let q = s.attitude;
        let kt = self.k_thrust;
        let kq = self.k_torque;
        let radius = self.model.prop.diameter_m * 0.5;
        let air_rel_world = s.velocity - self.wind_now;
        let air_rel_body = q.inverse_rotate(air_rel_world);
        let rho = self.air.density_kg_m3;
        let d2 = self.model.prop.diameter_m * self.model.prop.diameter_m;
        let mut force_body = Vec3::ZERO;
        let mut torque_body = Vec3::ZERO;
        for i in 0..4 {
            let w = self.rotors[i].omega;
            let ge = ground_effect_factor(self.rotor_height(s, i), radius);
            let thrust = kt * w * w * ge * self.thrust_scale[i];
            let reaction = kq * w * w * self.thrust_scale[i];
            let r = self.rotor_positions[i];
            let local_air = air_rel_body + s.rates.cross(r);
            let tip_speed = w * radius;
            let drag_gain = self.model.prop.rotor_drag_coefficient * rho * d2 * tip_speed;
            let rotor_drag = Vec3::new(-drag_gain * local_air.x, -drag_gain * local_air.y, 0.0);
            let f = Vec3::new(0.0, 0.0, -thrust) + rotor_drag;
            force_body += f;
            torque_body += r.cross(f);
            torque_body.z += -self.rotor_spin[i] * reaction;
        }
        let area = Vec3::from_array(self.model.aerodynamics.drag_area_m2);
        let cd = self.model.aerodynamics.drag_coefficient;
        let speed = air_rel_body.norm();
        force_body += -(air_rel_body.component_mul(area) * (0.5 * rho * cd * speed));

        let mut force_world = q.rotate(force_body) + Vec3::new(0.0, 0.0, self.model.mass_kg * G0);
        let mut contact_total = 0.0;
        for lp in &self.landing_points {
            let arm_world = q.rotate(*lp);
            let point = s.position + arm_world;
            let penetration = point.z;
            if penetration <= 0.0 {
                continue;
            }
            let point_vel = s.velocity + q.rotate(s.rates.cross(*lp));
            let normal = (CONTACT_STIFFNESS * penetration + CONTACT_DAMPING * point_vel.z).max(0.0);
            let tangential = Vec3::new(point_vel.x, point_vel.y, 0.0) * -FRICTION_VISCOUS;
            let t_mag = tangential.norm();
            let limit = FRICTION_COEFFICIENT * normal;
            let tangential = if t_mag > limit && t_mag > 0.0 {
                tangential * (limit / t_mag)
            } else {
                tangential
            };
            let f_world = Vec3::new(tangential.x, tangential.y, -normal);
            force_world += f_world;
            torque_body += lp.cross(q.inverse_rotate(f_world));
            contact_total += normal;
        }

        let h = self.inertia.mul_vec(s.rates);
        let angular_acceleration = self.inertia_inv.mul_vec(torque_body - s.rates.cross(h));
        Derivative {
            velocity: s.velocity,
            acceleration: force_world / self.model.mass_kg,
            attitude: q.derivative(s.rates),
            angular_acceleration,
            contact_force: contact_total,
        }
    }

    fn integrate(s: &RigidState, d: &Derivative, h: f64) -> RigidState {
        RigidState {
            position: s.position + d.velocity * h,
            velocity: s.velocity + d.acceleration * h,
            attitude: s.attitude.add_scaled(d.attitude, h),
            rates: s.rates + d.angular_acceleration * h,
        }
    }

    pub fn step(&mut self, motor_command: [f64; 4]) {
        let dt = self.dt;
        let t = self.time_s();
        self.update_air();
        let airspeed = (self.state.velocity - self.wind_now).norm();
        self.wind_now = self.wind.step(t, airspeed, dt);

        let kq = self.k_torque;
        let bus = self.battery.voltage_v;
        let alpha = self.rotor_alpha;
        let mut load = self.model.battery.avionics_current_a;
        for (i, rotor) in self.rotors.iter_mut().enumerate() {
            advance_rotor(
                rotor,
                &self.model.motor,
                kq,
                motor_command[i],
                bus,
                alpha,
                dt,
            );
            load += rotor.current_a;
        }
        self.battery.step(load, dt);

        let s0 = self.state;
        let k1 = self.derivative(&s0);
        let k2 = self.derivative(&Self::integrate(&s0, &k1, dt * 0.5));
        let k3 = self.derivative(&Self::integrate(&s0, &k2, dt * 0.5));
        let k4 = self.derivative(&Self::integrate(&s0, &k3, dt));
        let sixth = dt / 6.0;
        let combine = |a: Vec3, b: Vec3, c: Vec3, d: Vec3| (a + (b + c) * 2.0 + d) * sixth;
        let dq = |f: fn(&Quat) -> f64| {
            (f(&k1.attitude) + 2.0 * (f(&k2.attitude) + f(&k3.attitude)) + f(&k4.attitude)) * sixth
        };
        self.state = RigidState {
            position: s0.position + combine(k1.velocity, k2.velocity, k3.velocity, k4.velocity),
            velocity: s0.velocity
                + combine(
                    k1.acceleration,
                    k2.acceleration,
                    k3.acceleration,
                    k4.acceleration,
                ),
            attitude: Quat::new(
                s0.attitude.w + dq(|q| q.w),
                s0.attitude.x + dq(|q| q.x),
                s0.attitude.y + dq(|q| q.y),
                s0.attitude.z + dq(|q| q.z),
            )
            .normalized(),
            rates: s0.rates
                + combine(
                    k1.angular_acceleration,
                    k2.angular_acceleration,
                    k3.angular_acceleration,
                    k4.angular_acceleration,
                ),
        };
        let kt = self.k_thrust;
        let radius = self.model.prop.diameter_m * 0.5;
        for i in 0..4 {
            let w = self.rotors[i].omega;
            let ge = ground_effect_factor(self.rotor_height(&self.state, i), radius);
            self.rotors[i].thrust_n = kt * w * w * ge * self.thrust_scale[i];
            self.rotors[i].torque_nm = kq * w * w * self.thrust_scale[i];
        }
        self.step_count += 1;
        self.last_derivative = k4;
        self.sample_sensors();
    }

    fn sample_sensors(&mut self) {
        let t = self.time_s();
        let s = self.state;
        let d = self.last_derivative;
        let gravity = Vec3::new(0.0, 0.0, G0);
        let r = self.imu_position;
        let lever = d.angular_acceleration.cross(r) + s.rates.cross(s.rates.cross(r));
        let specific_force = s.attitude.inverse_rotate(d.acceleration - gravity) + lever;
        let hover = self.model.derived.hover_omega_rad_s.max(1.0);
        let vib = VibrationInput {
            rotor_phase: core::array::from_fn(|i| self.rotors[i].phase),
            rotor_load: core::array::from_fn(|i| self.rotors[i].omega / hover),
        };
        self.imu.step(
            t,
            self.dt,
            ImuTruth {
                gyro_body: s.rates,
                specific_force_body: specific_force,
            },
            &vib,
        );
        let baro_offset = s
            .attitude
            .rotate(Vec3::from_array(self.model.baro.position_m));
        self.baro.step(
            t,
            self.site_altitude_m - (s.position + baro_offset).z,
            &self.atmosphere,
        );
        self.adc
            .step(t, self.battery.voltage_v, self.battery.current_a);
    }

    pub fn sensors(&self) -> SensorFrame {
        SensorFrame {
            time_us: self.time_us(),
            imu: self.imu.sample,
            baro: self.baro.sample,
            adc: self.adc.sample,
        }
    }

    pub fn imu_clean(&self) -> (Vec3, Vec3) {
        (self.imu.clean_gyro_dps, self.imu.clean_accel_mps2)
    }

    pub fn truth(&self) -> Truth {
        let s = self.state;
        let lowest = self
            .landing_points
            .iter()
            .map(|p| (s.position + s.attitude.rotate(*p)).z)
            .fold(f64::NEG_INFINITY, f64::max);
        Truth {
            time_s: self.time_s(),
            position_m: s.position,
            velocity_mps: s.velocity,
            acceleration_mps2: self.last_derivative.acceleration,
            attitude: s.attitude,
            euler_rad: s.attitude.to_euler(),
            rates_rad_s: s.rates,
            rotor_omega: core::array::from_fn(|i| self.rotors[i].omega),
            rotor_thrust_n: core::array::from_fn(|i| self.rotors[i].thrust_n),
            rotor_current_a: core::array::from_fn(|i| self.rotors[i].current_a),
            motor_command: core::array::from_fn(|i| self.rotors[i].command),
            battery_v: self.battery.voltage_v,
            battery_current_a: self.battery.current_a,
            battery_soc: self.battery.soc,
            consumed_mah: self.battery.consumed_mah,
            wind_mps: self.wind_now,
            contact_force_n: self.last_derivative.contact_force,
            on_ground: self.last_derivative.contact_force > 1e-6,
            height_agl_m: -lowest,
        }
    }

    pub fn contact(&self) -> (bool, f64) {
        let s = self.state;
        let lowest = self
            .landing_points
            .iter()
            .map(|p| (s.position + s.attitude.rotate(*p)).z)
            .fold(f64::NEG_INFINITY, f64::max);
        (self.last_derivative.contact_force > 1e-6, -lowest)
    }

    pub fn velocity(&self) -> Vec3 {
        self.state.velocity
    }

    pub fn kinetic_energy(&self) -> f64 {
        let s = self.state;
        let lin = 0.5 * self.model.mass_kg * s.velocity.dot(s.velocity);
        let rot = 0.5 * s.rates.dot(self.inertia.mul_vec(s.rates));
        lin + rot
    }

    pub fn potential_energy(&self) -> f64 {
        -self.model.mass_kg * G0 * self.state.position.z
    }

    pub fn set_state_for_test(&mut self, state: RigidState) {
        self.state = state;
        self.last_derivative = self.derivative(&self.state);
    }

    pub fn set_rotor_omega_for_test(&mut self, omega: [f64; 4]) {
        for (r, w) in self.rotors.iter_mut().zip(omega) {
            r.omega = w;
        }
    }
}
