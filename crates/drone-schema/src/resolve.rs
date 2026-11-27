use sha2::{Digest, Sha256};

use drone_sim::Mat3;
use drone_sim::Vec3;
use drone_sim::atmosphere::Atmosphere;
use drone_sim::model::{
    AdcModel, AeroModel, AirframeModel, BaroModel, BatteryModel, DerivedPerformance, ImuModel,
    LimitsModel, LoopRates, MODEL_FORMAT_VERSION, MotorModel, PropModel, RotorModel,
    VibrationModel,
};
use drone_sim::propulsion::{
    steady_state_current, steady_state_omega, thrust_constant, torque_constant,
};

use crate::load::Repository;
use crate::manifest::{
    Airframe, Battery, Board, ComponentRef, Device, Frame, Mcu, Motor, Prop, Sensor, SensorType,
};

const MM: f64 = 0.001;
const G: f64 = 0.001;
const AVIONICS_CURRENT_A: f64 = 0.25;

#[derive(Clone, Debug)]
pub struct Resolved<'a> {
    pub airframe: &'a Airframe,
    pub board: &'a Board,
    pub mcu: &'a Mcu,
    pub frame: &'a Frame,
    pub battery: &'a Battery,
    pub motor: &'a Motor,
    pub prop: &'a Prop,
    pub imu_device: &'a Device,
    pub imu: &'a Sensor,
    pub baro_device: &'a Device,
    pub baro: &'a Sensor,
    pub model: AirframeModel,
    pub masses: Vec<MassItem>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct MassItem {
    pub id: String,
    pub mass_kg: f64,
    pub position_m: Vec3,
    pub size_m: Vec3,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ResolveError {
    #[error("unknown {kind} `{id}`")]
    Missing { kind: &'static str, id: String },
    #[error("board `{0}` has no {1} device")]
    NoDevice(String, &'static str),
    #[error("inertia tensor is singular")]
    SingularInertia,
}

fn get<'a, T>(
    map: &'a std::collections::BTreeMap<String, crate::load::Located<T>>,
    kind: &'static str,
    id: &str,
) -> Result<&'a T, ResolveError> {
    map.get(id).map(|l| &l.value).ok_or(ResolveError::Missing {
        kind,
        id: id.to_owned(),
    })
}

fn box_inertia(m: f64, size: Vec3) -> Mat3 {
    let (a, b, c) = (size.x, size.y, size.z);
    Mat3::new([
        [m * (b * b + c * c) / 12.0, 0.0, 0.0],
        [0.0, m * (a * a + c * c) / 12.0, 0.0],
        [0.0, 0.0, m * (a * a + b * b) / 12.0],
    ])
}

fn parallel_axis(m: f64, d: Vec3) -> Mat3 {
    let d2 = d.dot(d);
    let v = [d.x, d.y, d.z];
    let mut r = [[0.0; 3]; 3];
    for (i, row) in r.iter_mut().enumerate() {
        for (j, cell) in row.iter_mut().enumerate() {
            let delta = if i == j { 1.0 } else { 0.0 };
            *cell = m * (d2 * delta - v[i] * v[j]);
        }
    }
    Mat3::new(r)
}

fn add(a: Mat3, b: Mat3) -> Mat3 {
    let mut r = a.m;
    for (i, row) in r.iter_mut().enumerate() {
        for (j, cell) in row.iter_mut().enumerate() {
            *cell += b.m[i][j];
        }
    }
    Mat3::new(r)
}

pub fn body_from_sensor(mount_yaw_deg: f64, device: &Device) -> Mat3 {
    let o = device
        .orientation
        .unwrap_or(crate::manifest::Orientation::Cw0);
    let yaw = Mat3::rotation_z((mount_yaw_deg + o.yaw_deg()).to_radians());
    let flip = if o.flipped() {
        Mat3::rotation_x(core::f64::consts::PI)
    } else {
        Mat3::IDENTITY
    };
    let m = yaw.mul_mat(&flip);
    Mat3::new(m.m.map(|row| row.map(clean)))
}

fn clean(v: f64) -> f64 {
    let r = (v * 1e12).round() / 1e12;
    if r == 0.0 { 0.0 } else { r }
}

pub fn round_sig(v: f64) -> f64 {
    if v.abs() < 1e-15 || !v.is_finite() {
        return if v.is_finite() { 0.0 } else { v };
    }
    let digits = 9 - (v.abs().log10().floor() as i32) - 1;
    let factor = 10f64.powi(digits);
    let r = (v * factor).round() / factor;
    if r == 0.0 { 0.0 } else { r }
}

fn round3(v: Vec3) -> [f64; 3] {
    [round_sig(v.x), round_sig(v.y), round_sig(v.z)]
}

fn device_in_body(airframe: &Airframe, device: &Device) -> Vec3 {
    let mount = Vec3::from_array(airframe.board_mount.position_mm) * MM;
    let yaw = Mat3::rotation_z(airframe.board_mount.yaw_deg.to_radians());
    let local = Vec3::new(
        device.position_mm[0],
        device.position_mm[1],
        -device.position_mm[2],
    ) * MM;
    mount + yaw.mul_vec(local)
}

fn find_device<'a>(
    board: &'a Board,
    sensors: &'a std::collections::BTreeMap<String, crate::load::Located<Sensor>>,
    ty: SensorType,
) -> Option<(&'a Device, &'a Sensor)> {
    board.devices.iter().find_map(|d| {
        let s = &sensors.get(&d.component)?.value;
        (s.sensor_type == ty).then_some((d, s))
    })
}

pub fn source_hash(parts: &[serde_json::Value]) -> String {
    let mut h = Sha256::new();
    for p in parts {
        h.update(p.to_string().as_bytes());
        h.update([0u8]);
    }
    let digest = h.finalize();
    digest.iter().take(8).map(|b| format!("{b:02x}")).collect()
}

pub fn resolve<'a>(repo: &'a Repository, airframe_id: &str) -> Result<Resolved<'a>, ResolveError> {
    let airframe = get(&repo.airframes, "airframe", airframe_id)?;
    resolve_with(repo, airframe)
}

pub fn resolve_with<'a>(
    repo: &'a Repository,
    airframe: &'a Airframe,
) -> Result<Resolved<'a>, ResolveError> {
    let board = get(&repo.boards, "board", &airframe.board)?;
    let mcu = get(&repo.mcus, "mcu", &board.mcu)?;
    let frame = get(&repo.frames, "frame", &airframe.frame)?;
    let battery = get(&repo.batteries, "battery", &airframe.battery)?;
    let motor = get(&repo.motors, "motor", &airframe.motor)?;
    let prop = get(&repo.props, "prop", &airframe.prop)?;
    let (imu_device, imu) = find_device(board, &repo.sensors, SensorType::Imu)
        .ok_or_else(|| ResolveError::NoDevice(board.id.clone(), "imu"))?;
    let (baro_device, baro) = find_device(board, &repo.sensors, SensorType::Barometer)
        .ok_or_else(|| ResolveError::NoDevice(board.id.clone(), "barometer"))?;

    let mut masses: Vec<MassItem> = Vec::new();
    for c in &airframe.components {
        let mass_g = match c.reference {
            Some(ComponentRef::Battery) => battery.mass_g,
            Some(ComponentRef::Board) => board.mass_g,
            Some(ComponentRef::Frame) => frame.mass_g,
            None => c.mass_g.unwrap_or(0.0),
        };
        masses.push(MassItem {
            id: c.id.clone(),
            mass_kg: mass_g * G,
            position_m: Vec3::from_array(c.position_mm) * MM,
            size_m: Vec3::from_array(c.size_mm) * MM,
        });
    }
    let prop_radius = prop.diameter_mm * MM * 0.5;
    for r in &airframe.rotors {
        let p = Vec3::from_array(r.position_mm) * MM;
        masses.push(MassItem {
            id: format!("motor_{}", r.id),
            mass_kg: motor.mass_g * G,
            position_m: p + Vec3::new(0.0, 0.0, 0.004),
            size_m: Vec3::new(
                motor.stator_mm[0] * MM * 1.3,
                motor.stator_mm[0] * MM * 1.3,
                0.010,
            ),
        });
        masses.push(MassItem {
            id: format!("prop_{}", r.id),
            mass_kg: prop.mass_g * G,
            position_m: p,
            size_m: Vec3::new(prop_radius * 1.15, prop_radius * 1.15, 0.004),
        });
    }

    let total: f64 = masses.iter().map(|m| m.mass_kg).sum();
    let com = masses
        .iter()
        .fold(Vec3::ZERO, |acc, m| acc + m.position_m * m.mass_kg)
        / total;
    let inertia = masses.iter().fold(Mat3::new([[0.0; 3]; 3]), |acc, m| {
        add(
            acc,
            add(
                box_inertia(m.mass_kg, m.size_m),
                parallel_axis(m.mass_kg, m.position_m - com),
            ),
        )
    });
    if inertia.inverse().is_none() {
        return Err(ResolveError::SingularInertia);
    }

    let rotors: Vec<RotorModel> = airframe
        .rotors
        .iter()
        .map(|r| RotorModel {
            id: r.id.clone(),
            position_m: round3(Vec3::from_array(r.position_mm) * MM - com),
            spin: r.spin,
        })
        .collect();

    let imu_spec = imu
        .imu
        .clone()
        .ok_or_else(|| ResolveError::NoDevice(board.id.clone(), "imu"))?;
    let baro_spec = baro
        .barometer
        .clone()
        .ok_or_else(|| ResolveError::NoDevice(board.id.clone(), "barometer"))?;
    let sensor_from_body = body_from_sensor(airframe.board_mount.yaw_deg, imu_device).transpose();

    let motor_model = MotorModel {
        id: motor.id.clone(),
        kv_rad_per_s_per_v: round_sig(motor.kv_rpm_per_v * core::f64::consts::PI / 30.0),
        resistance_ohm: motor.winding_resistance_ohm,
        no_load_current_a: motor.no_load_current_a,
        max_current_a: motor.max_current_a,
        time_constant_s: motor.time_constant_s,
    };
    let prop_model = PropModel {
        id: prop.id.clone(),
        diameter_m: round_sig(prop.diameter_mm * MM),
        thrust_coefficient: prop.thrust_coefficient,
        torque_coefficient: prop.torque_coefficient,
        rotor_drag_coefficient: prop.rotor_drag_coefficient,
    };
    let battery_model = BatteryModel {
        id: battery.id.clone(),
        cells: battery.cells,
        capacity_ah: round_sig(battery.capacity_mah / 1000.0),
        ocv_curve: battery.ocv_curve.clone(),
        r0_ohm: battery.thevenin.r0_ohm,
        r1_ohm: battery.thevenin.r1_ohm,
        c1_f: battery.thevenin.c1_f,
        cell_full_v: battery.cell_voltage.full,
        cell_empty_v: battery.cell_voltage.empty,
        avionics_current_a: AVIONICS_CURRENT_A,
    };

    let rho = Atmosphere::new(0.0, 15.0).at(0.0).density_kg_m3;
    let kt = thrust_constant(&prop_model, rho);
    let kq = torque_constant(&prop_model, rho);
    let weight = total * drone_sim::atmosphere::G0;
    let hover_thrust = weight / airframe.rotors.len() as f64;
    let nominal_v = battery.cell_voltage.nominal * f64::from(battery.cells);
    let max_omega = steady_state_omega(&motor_model, kq, nominal_v);
    let max_thrust = kt * max_omega * max_omega;
    let hover_omega = (hover_thrust / kt).sqrt();
    let hover_current = steady_state_current(&motor_model, kq, hover_omega)
        * airframe.rotors.len() as f64
        + AVIONICS_CURRENT_A;
    let derived = DerivedPerformance {
        weight_n: round_sig(weight),
        hover_thrust_per_rotor_n: round_sig(hover_thrust),
        max_thrust_per_rotor_n: round_sig(max_thrust),
        thrust_to_weight: round_sig(max_thrust * airframe.rotors.len() as f64 / weight),
        hover_thrust_fraction: round_sig(hover_thrust / max_thrust),
        hover_omega_rad_s: round_sig(hover_omega),
        max_omega_rad_s: round_sig(max_omega),
        hover_current_a: round_sig(hover_current),
        hover_time_min: round_sig(0.8 * battery.capacity_mah / 1000.0 / hover_current * 60.0),
    };

    let hash = source_hash(&[
        serde_json::to_value(airframe).unwrap_or_default(),
        serde_json::to_value(board).unwrap_or_default(),
        serde_json::to_value(mcu).unwrap_or_default(),
        serde_json::to_value(frame).unwrap_or_default(),
        serde_json::to_value(battery).unwrap_or_default(),
        serde_json::to_value(motor).unwrap_or_default(),
        serde_json::to_value(prop).unwrap_or_default(),
        serde_json::to_value(imu).unwrap_or_default(),
        serde_json::to_value(baro).unwrap_or_default(),
    ]);

    let model = AirframeModel {
        format_version: MODEL_FORMAT_VERSION,
        id: airframe.id.clone(),
        name: airframe.name.clone(),
        source_hash: hash,
        mass_kg: round_sig(total),
        center_of_mass_m: round3(com),
        inertia_kg_m2: inertia.m.map(|row| row.map(round_sig)),
        rotors,
        motor: motor_model,
        prop: prop_model,
        battery: battery_model,
        aerodynamics: AeroModel {
            drag_area_m2: airframe.aerodynamics.drag_area_m2,
            drag_coefficient: airframe.aerodynamics.drag_coefficient,
        },
        landing_points_m: airframe
            .landing_points_mm
            .iter()
            .map(|p| round3(Vec3::from_array(*p) * MM - com))
            .collect(),
        imu: ImuModel {
            id: imu.id.clone(),
            position_m: round3(device_in_body(airframe, imu_device) - com),
            sensor_from_body: sensor_from_body.m,
            gyro_lsb_per_dps: imu_spec.gyro_lsb_per_dps,
            accel_lsb_per_g: imu_spec.accel_lsb_per_g,
            gyro_range_dps: imu_spec.gyro_range_dps,
            accel_range_g: imu_spec.accel_range_g,
            odr_hz: imu_spec.odr_hz,
            latency_s: round_sig(imu_spec.latency_us * 1e-6),
            gyro_noise_density_dps_rthz: imu_spec.gyro_noise_density_dps_rthz,
            accel_noise_density_ug_rthz: imu_spec.accel_noise_density_ug_rthz,
            gyro_bias_instability_dps: imu_spec.gyro_bias_instability_dps,
            gyro_bias_random_walk_dps_rthz: imu_spec.gyro_bias_random_walk_dps_rthz,
            accel_bias_instability_mg: imu_spec.accel_bias_instability_mg,
            who_am_i: imu.identity.value,
        },
        baro: BaroModel {
            id: baro.id.clone(),
            position_m: round3(device_in_body(airframe, baro_device) - com),
            odr_hz: baro_spec.odr_hz,
            latency_s: round_sig(baro_spec.latency_us * 1e-6),
            pressure_noise_pa: baro_spec.pressure_noise_pa,
            temperature_noise_c: baro_spec.temperature_noise_c,
        },
        adc: AdcModel {
            reference_v: board.analog.adc_reference_v,
            bits: board.analog.adc_bits,
            vbat_divider_ratio: board.analog.vbat.divider_ratio,
            current_scale_v_per_a: round_sig(board.analog.current.scale_mv_per_a / 1000.0),
            current_offset_v: round_sig(board.analog.current.offset_mv / 1000.0),
        },
        vibration: VibrationModel {
            rotor_imbalance_accel_mps2: airframe.vibration.rotor_imbalance_accel_mps2,
            rotor_imbalance_gyro_dps: airframe.vibration.rotor_imbalance_gyro_dps,
            broadband_accel_mps2: airframe.vibration.broadband_accel_mps2,
            broadband_gyro_dps: airframe.vibration.broadband_gyro_dps,
        },
        rates: LoopRates {
            physics_hz: airframe.loop_rates.physics_hz,
            control_hz: airframe.loop_rates.control_hz,
            telemetry_hz: airframe.loop_rates.telemetry_hz,
        },
        limits: LimitsModel {
            max_tilt_deg: airframe.limits.max_tilt_deg,
            max_rate_dps: airframe.limits.max_rate_dps,
            max_climb_mps: airframe.limits.max_climb_mps,
            battery_warning_cell_v: airframe.limits.battery_warning_cell_v,
            battery_critical_cell_v: airframe.limits.battery_critical_cell_v,
        },
        derived,
    };

    Ok(Resolved {
        airframe,
        board,
        mcu,
        frame,
        battery,
        motor,
        prop,
        imu_device,
        imu,
        baro_device,
        baro,
        model,
        masses,
    })
}
