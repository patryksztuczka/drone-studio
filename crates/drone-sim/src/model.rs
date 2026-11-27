use serde::{Deserialize, Serialize};

pub const MODEL_FORMAT_VERSION: u32 = 1;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AirframeModel {
    pub format_version: u32,
    pub id: String,
    pub name: String,
    pub source_hash: String,
    pub mass_kg: f64,
    pub center_of_mass_m: [f64; 3],
    pub inertia_kg_m2: [[f64; 3]; 3],
    pub rotors: Vec<RotorModel>,
    pub motor: MotorModel,
    pub prop: PropModel,
    pub battery: BatteryModel,
    pub aerodynamics: AeroModel,
    pub landing_points_m: Vec<[f64; 3]>,
    pub imu: ImuModel,
    pub baro: BaroModel,
    pub adc: AdcModel,
    pub vibration: VibrationModel,
    pub rates: LoopRates,
    pub limits: LimitsModel,
    pub derived: DerivedPerformance,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RotorModel {
    pub id: String,
    pub position_m: [f64; 3],
    pub spin: Spin,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Spin {
    Cw,
    Ccw,
}

impl Spin {
    pub const fn sign(self) -> f64 {
        match self {
            Self::Cw => 1.0,
            Self::Ccw => -1.0,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MotorModel {
    pub id: String,
    pub kv_rad_per_s_per_v: f64,
    pub resistance_ohm: f64,
    pub no_load_current_a: f64,
    pub max_current_a: f64,
    pub time_constant_s: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PropModel {
    pub id: String,
    pub diameter_m: f64,
    pub thrust_coefficient: f64,
    pub torque_coefficient: f64,
    pub rotor_drag_coefficient: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BatteryModel {
    pub id: String,
    pub cells: u32,
    pub capacity_ah: f64,
    pub ocv_curve: Vec<[f64; 2]>,
    pub r0_ohm: f64,
    pub r1_ohm: f64,
    pub c1_f: f64,
    pub cell_full_v: f64,
    pub cell_empty_v: f64,
    pub avionics_current_a: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AeroModel {
    pub drag_area_m2: [f64; 3],
    pub drag_coefficient: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ImuModel {
    pub id: String,
    pub position_m: [f64; 3],
    pub sensor_from_body: [[f64; 3]; 3],
    pub gyro_lsb_per_dps: f64,
    pub accel_lsb_per_g: f64,
    pub gyro_range_dps: f64,
    pub accel_range_g: f64,
    pub odr_hz: f64,
    pub latency_s: f64,
    pub gyro_noise_density_dps_rthz: f64,
    pub accel_noise_density_ug_rthz: f64,
    pub gyro_bias_instability_dps: f64,
    pub gyro_bias_random_walk_dps_rthz: f64,
    pub accel_bias_instability_mg: f64,
    pub who_am_i: u8,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BaroModel {
    pub id: String,
    pub position_m: [f64; 3],
    pub odr_hz: f64,
    pub latency_s: f64,
    pub pressure_noise_pa: f64,
    pub temperature_noise_c: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AdcModel {
    pub reference_v: f64,
    pub bits: u32,
    pub vbat_divider_ratio: f64,
    pub current_scale_v_per_a: f64,
    pub current_offset_v: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VibrationModel {
    pub rotor_imbalance_accel_mps2: f64,
    pub rotor_imbalance_gyro_dps: f64,
    pub broadband_accel_mps2: f64,
    pub broadband_gyro_dps: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LoopRates {
    pub physics_hz: u32,
    pub control_hz: u32,
    pub telemetry_hz: u32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LimitsModel {
    pub max_tilt_deg: f64,
    pub max_rate_dps: [f64; 3],
    pub max_climb_mps: f64,
    pub battery_warning_cell_v: f64,
    pub battery_critical_cell_v: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DerivedPerformance {
    pub weight_n: f64,
    pub hover_thrust_per_rotor_n: f64,
    pub max_thrust_per_rotor_n: f64,
    pub thrust_to_weight: f64,
    pub hover_thrust_fraction: f64,
    pub hover_omega_rad_s: f64,
    pub max_omega_rad_s: f64,
    pub hover_current_a: f64,
    pub hover_time_min: f64,
}
