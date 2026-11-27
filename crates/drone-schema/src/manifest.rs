use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Mcu {
    pub kind: String,
    pub id: String,
    pub name: String,
    pub vendor: String,
    pub core: String,
    pub fpu: String,
    pub clock_hz: u64,
    pub flash_kb: u32,
    pub ram_kb: u32,
    pub rust_target: String,
    pub embassy_chip: String,
    pub renode: McuRenode,
    pub peripherals: McuPeripherals,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct McuRenode {
    pub platform: String,
    #[serde(default)]
    pub peripherals: Vec<RenodePeripheral>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RenodePeripheral {
    pub name: String,
    pub model: String,
    pub address: u32,
    pub rcc: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct McuPeripherals {
    pub spi: Vec<String>,
    pub i2c: Vec<String>,
    pub uart: Vec<String>,
    pub timers: Vec<String>,
    pub adc: Vec<String>,
    #[serde(default)]
    pub usb: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Sensor {
    pub kind: String,
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub sensor_type: SensorType,
    pub interface: BusKind,
    pub mass_g: f64,
    pub identity: SensorIdentity,
    pub imu: Option<ImuSpec>,
    pub barometer: Option<BaroSpec>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SensorType {
    Imu,
    Barometer,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum BusKind {
    Spi,
    I2c,
    Uart,
}

impl BusKind {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Spi => "spi",
            Self::I2c => "i2c",
            Self::Uart => "uart",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SensorIdentity {
    pub register: u8,
    pub value: u8,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ImuSpec {
    pub gyro_range_dps: f64,
    pub gyro_lsb_per_dps: f64,
    pub accel_range_g: f64,
    pub accel_lsb_per_g: f64,
    pub odr_hz: f64,
    pub latency_us: f64,
    pub gyro_noise_density_dps_rthz: f64,
    pub accel_noise_density_ug_rthz: f64,
    pub gyro_bias_instability_dps: f64,
    pub gyro_bias_random_walk_dps_rthz: f64,
    pub accel_bias_instability_mg: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BaroSpec {
    pub i2c_address: u8,
    pub odr_hz: f64,
    pub latency_us: f64,
    pub pressure_noise_pa: f64,
    pub temperature_noise_c: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Motor {
    pub kind: String,
    pub id: String,
    pub name: String,
    pub stator_mm: [f64; 2],
    pub kv_rpm_per_v: f64,
    pub mass_g: f64,
    pub winding_resistance_ohm: f64,
    pub no_load_current_a: f64,
    pub max_current_a: f64,
    pub time_constant_s: f64,
    pub shaft_mm: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Prop {
    pub kind: String,
    pub id: String,
    pub name: String,
    pub diameter_mm: f64,
    pub pitch_in: f64,
    pub blades: u32,
    pub mass_g: f64,
    pub thrust_coefficient: f64,
    pub torque_coefficient: f64,
    pub rotor_drag_coefficient: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Battery {
    pub kind: String,
    pub id: String,
    pub name: String,
    pub chemistry: String,
    pub cells: u32,
    pub capacity_mah: f64,
    pub mass_g: f64,
    pub max_discharge_c: f64,
    pub cell_voltage: CellVoltage,
    pub ocv_curve: Vec<[f64; 2]>,
    pub thevenin: Thevenin,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CellVoltage {
    pub full: f64,
    pub nominal: f64,
    pub empty: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Thevenin {
    pub r0_ohm: f64,
    pub r1_ohm: f64,
    pub c1_f: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Frame {
    pub kind: String,
    pub id: String,
    pub name: String,
    pub material: String,
    pub mass_g: f64,
    pub wheelbase_mm: f64,
    pub size_mm: [f64; 3],
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Board {
    pub kind: String,
    pub id: String,
    pub name: String,
    pub mcu: String,
    pub mass_g: f64,
    pub size_mm: [f64; 2],
    pub thickness_mm: f64,
    pub hse_hz: u64,
    pub mounting_holes_mm: Vec<[f64; 2]>,
    pub buses: Vec<Bus>,
    pub devices: Vec<Device>,
    pub motor_outputs: Vec<MotorOutput>,
    pub motor_protocol: MotorProtocol,
    pub analog: Analog,
    pub leds: Vec<Led>,
    pub pads: Vec<Pad>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Bus {
    pub id: String,
    pub kind: BusKind,
    pub peripheral: String,
    pub frequency_hz: u64,
    pub pins: BTreeMap<String, String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Device {
    pub id: String,
    pub component: String,
    pub bus: String,
    pub chip_select: Option<String>,
    pub interrupt: Option<String>,
    pub address: Option<u8>,
    pub orientation: Option<Orientation>,
    pub position_mm: [f64; 3],
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Orientation {
    Cw0,
    Cw90,
    Cw180,
    Cw270,
    Cw0flip,
    Cw90flip,
    Cw180flip,
    Cw270flip,
}

impl Orientation {
    pub const fn yaw_deg(self) -> f64 {
        match self {
            Self::Cw0 | Self::Cw0flip => 0.0,
            Self::Cw90 | Self::Cw90flip => 90.0,
            Self::Cw180 | Self::Cw180flip => 180.0,
            Self::Cw270 | Self::Cw270flip => 270.0,
        }
    }

    pub const fn flipped(self) -> bool {
        matches!(
            self,
            Self::Cw0flip | Self::Cw90flip | Self::Cw180flip | Self::Cw270flip
        )
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MotorOutput {
    pub id: String,
    pub timer: String,
    pub channel: u8,
    pub pin: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MotorProtocol {
    pub kind: String,
    pub frequency_hz: u32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Analog {
    pub vbat: AnalogVbat,
    pub current: AnalogCurrent,
    pub adc_reference_v: f64,
    pub adc_bits: u32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AnalogVbat {
    pub pin: String,
    pub adc: String,
    pub channel: u8,
    pub divider_ratio: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AnalogCurrent {
    pub pin: String,
    pub adc: String,
    pub channel: u8,
    pub scale_mv_per_a: f64,
    pub offset_mv: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Led {
    pub id: String,
    pub pin: String,
    pub active_high: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Pad {
    pub id: String,
    pub label: String,
    pub net: String,
    pub x_mm: f64,
    pub y_mm: f64,
    pub kind: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Airframe {
    pub kind: String,
    pub id: String,
    pub name: String,
    pub description: String,
    pub configuration: String,
    pub frame: String,
    pub board: String,
    pub battery: String,
    pub motor: String,
    pub prop: String,
    pub board_mount: BoardMount,
    pub rotors: Vec<Rotor>,
    pub components: Vec<Component>,
    pub landing_points_mm: Vec<[f64; 3]>,
    pub aerodynamics: Aerodynamics,
    pub vibration: Vibration,
    pub limits: Limits,
    pub loop_rates: LoopRates,
    pub visual: Visual,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BoardMount {
    pub position_mm: [f64; 3],
    pub yaw_deg: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Rotor {
    pub id: String,
    pub output: String,
    pub position_mm: [f64; 3],
    pub spin: drone_sim::model::Spin,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ComponentRef {
    Battery,
    Board,
    Frame,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Component {
    pub id: String,
    #[serde(rename = "ref")]
    pub reference: Option<ComponentRef>,
    pub mass_g: Option<f64>,
    pub position_mm: [f64; 3],
    pub size_mm: [f64; 3],
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Aerodynamics {
    pub drag_area_m2: [f64; 3],
    pub drag_coefficient: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Vibration {
    pub rotor_imbalance_accel_mps2: f64,
    pub rotor_imbalance_gyro_dps: f64,
    pub broadband_accel_mps2: f64,
    pub broadband_gyro_dps: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Limits {
    pub max_tilt_deg: f64,
    pub max_rate_dps: [f64; 3],
    pub max_climb_mps: f64,
    pub battery_warning_cell_v: f64,
    pub battery_critical_cell_v: f64,
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
pub struct Visual {
    pub procedural: bool,
    pub mesh: Option<String>,
    pub colors: BTreeMap<String, String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Scenario {
    pub kind: String,
    pub id: String,
    pub name: String,
    pub description: String,
    pub tags: Vec<String>,
    pub airframe: String,
    pub duration_s: f64,
    pub seed: u64,
    pub environment: Environment,
    #[serde(default)]
    pub initial: Initial,
    #[serde(default)]
    pub faults: Vec<Fault>,
    pub pilot: Vec<PilotKeyframe>,
    #[serde(default)]
    pub params: BTreeMap<String, f64>,
    pub assertions: Vec<Assertion>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Environment {
    pub altitude_asl_m: f64,
    pub temperature_c: f64,
    #[serde(default)]
    pub steady_wind_mps: [f64; 3],
    #[serde(default)]
    pub turbulence: drone_sim::Turbulence,
    #[serde(default)]
    pub gusts: Vec<GustSpec>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GustSpec {
    pub t: f64,
    pub duration_s: f64,
    pub ramp_s: f64,
    pub velocity_mps: [f64; 3],
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Initial {
    #[serde(default)]
    pub position_m: [f64; 3],
    #[serde(default)]
    pub yaw_deg: f64,
    #[serde(default = "full")]
    pub battery_soc: f64,
}

const fn full() -> f64 {
    1.0
}

impl Default for Initial {
    fn default() -> Self {
        Self {
            position_m: [0.0; 3],
            yaw_deg: 0.0,
            battery_soc: 1.0,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FaultKind {
    MotorDegradation,
    RcLoss,
    GyroBiasStep,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Fault {
    pub t: f64,
    pub kind: FaultKind,
    pub motor: Option<String>,
    pub thrust_scale: Option<f64>,
    pub duration_s: Option<f64>,
    pub bias_dps: Option<[f64; 3]>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PilotMode {
    Angle,
    Althold,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PilotKeyframe {
    pub t: f64,
    pub arm: Option<bool>,
    pub mode: Option<PilotMode>,
    pub roll: Option<f64>,
    pub pitch: Option<f64>,
    pub yaw: Option<f64>,
    pub throttle: Option<f64>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssertionKind {
    AltitudeWithin,
    MaxTiltDeg,
    AttitudeErrorRmsDeg,
    NoFailsafe,
    FailsafeTriggered,
    ArmedAt,
    DisarmedAtEnd,
    TouchdownSpeedMaxMps,
    BatteryMinV,
    StepResponse,
    MaxMotorSaturationPct,
    HorizontalSpeedMaxMps,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Axis {
    Roll,
    Pitch,
    Yaw,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Assertion {
    pub kind: AssertionKind,
    pub window: Option<[f64; 2]>,
    pub t: Option<f64>,
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub axis: Option<Axis>,
    pub target_deg: Option<f64>,
    pub max_overshoot_pct: Option<f64>,
    pub rise_time_max_s: Option<f64>,
    pub settle_s: Option<f64>,
    pub tolerance_deg: Option<f64>,
}
