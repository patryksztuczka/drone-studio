use postcard::experimental::max_size::MaxSize;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, MaxSize)]
#[repr(u8)]
pub enum MessageKind {
    SimStepInput = 1,
    ActuatorOutput = 2,
    Telemetry = 3,
    Command = 4,
    Reply = 5,
}

impl MessageKind {
    pub const fn from_u8(v: u8) -> Option<Self> {
        match v {
            1 => Some(Self::SimStepInput),
            2 => Some(Self::ActuatorOutput),
            3 => Some(Self::Telemetry),
            4 => Some(Self::Command),
            5 => Some(Self::Reply),
            _ => None,
        }
    }
}

pub trait Message: Serialize + for<'de> Deserialize<'de> + MaxSize {
    const KIND: MessageKind;
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, MaxSize)]
pub struct ImuRaw {
    pub seq: u32,
    pub gyro: [i16; 3],
    pub accel: [i16; 3],
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize, MaxSize)]
pub struct BaroReading {
    pub seq: u32,
    pub pressure_pa: f32,
    pub temperature_c: f32,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, MaxSize)]
pub struct BatteryAdc {
    pub vbat_raw: u16,
    pub current_raw: u16,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, MaxSize)]
pub enum FlightModeRequest {
    #[default]
    Angle,
    AltHold,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize, MaxSize)]
pub struct RcSticks {
    pub roll: f32,
    pub pitch: f32,
    pub yaw: f32,
    pub throttle: f32,
    pub arm: bool,
    pub mode: FlightModeRequest,
    pub valid: bool,
}

pub mod fault_flags {
    pub const MOTOR_DEGRADED: u16 = 1 << 0;
    pub const RC_LOSS: u16 = 1 << 1;
    pub const GYRO_BIAS: u16 = 1 << 2;
    pub const WIND_GUST: u16 = 1 << 3;
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize, MaxSize)]
pub struct SimStepInput {
    pub step: u32,
    pub time_us: u64,
    pub dt_us: u32,
    pub imu: ImuRaw,
    pub baro: BaroReading,
    pub battery: BatteryAdc,
    pub rc: RcSticks,
    pub faults: u16,
}

impl Message for SimStepInput {
    const KIND: MessageKind = MessageKind::SimStepInput;
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, MaxSize)]
pub enum ArmState {
    #[default]
    Disarmed,
    Armed,
    Failsafe,
}

pub mod status_flags {
    pub const GYRO_CALIBRATED: u16 = 1 << 0;
    pub const ALT_HOLD: u16 = 1 << 1;
    pub const MOTOR_SATURATED: u16 = 1 << 2;
    pub const BATTERY_WARNING: u16 = 1 << 3;
    pub const BATTERY_CRITICAL: u16 = 1 << 4;
    pub const RC_LOST: u16 = 1 << 5;
    pub const LANDED: u16 = 1 << 6;
    pub const IMU_FAULT: u16 = 1 << 7;
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, MaxSize)]
pub enum LogLevel {
    #[default]
    Info,
    Warn,
    Error,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, MaxSize)]
pub enum LogCode {
    #[default]
    Boot,
    GyroCalibrated,
    Armed,
    Disarmed,
    ArmRejected,
    FailsafeEntered,
    FailsafeCleared,
    Landed,
    BatteryWarning,
    BatteryCritical,
    MotorSaturation,
    ImuFault,
    RcLost,
    RcRestored,
    ParamChanged,
    CrashDetected,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, MaxSize)]
pub struct LogRecord {
    pub time_us: u64,
    pub level: LogLevel,
    pub code: LogCode,
    pub args: [i32; 2],
}

pub const MAX_LOGS_PER_STEP: usize = 4;

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize, MaxSize)]
pub struct ActuatorOutput {
    pub step: u32,
    pub time_us: u64,
    pub motors: [f32; 4],
    pub arm_state: ArmState,
    pub status: u16,
    pub log_count: u8,
    pub logs: [LogRecord; MAX_LOGS_PER_STEP],
}

impl ActuatorOutput {
    pub fn push_log(&mut self, record: LogRecord) -> bool {
        let n = usize::from(self.log_count);
        if n >= MAX_LOGS_PER_STEP {
            return false;
        }
        self.logs[n] = record;
        self.log_count += 1;
        true
    }

    pub fn logs(&self) -> &[LogRecord] {
        &self.logs[..usize::from(self.log_count).min(MAX_LOGS_PER_STEP)]
    }
}

impl Message for ActuatorOutput {
    const KIND: MessageKind = MessageKind::ActuatorOutput;
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize, MaxSize)]
pub struct TelemetryFrame {
    pub seq: u32,
    pub time_us: u64,
    pub attitude: [f32; 4],
    pub attitude_setpoint: [f32; 4],
    pub rates_dps: [f32; 3],
    pub position_m: [f32; 3],
    pub velocity_mps: [f32; 3],
    pub altitude_setpoint_m: f32,
    pub rotor_thrust_n: [f32; 4],
    pub rotor_rpm: [u16; 4],
    pub motor_command: [f32; 4],
    pub battery_v: f32,
    pub battery_a: f32,
    pub arm_state: ArmState,
    pub status: u16,
}

impl Message for TelemetryFrame {
    const KIND: MessageKind = MessageKind::Telemetry;
}

pub const SCENARIO_ID_LEN: usize = 32;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, MaxSize)]
pub struct ScenarioId {
    pub len: u8,
    pub bytes: [u8; SCENARIO_ID_LEN],
}

impl ScenarioId {
    pub fn new(id: &str) -> Option<Self> {
        let raw = id.as_bytes();
        if raw.len() > SCENARIO_ID_LEN {
            return None;
        }
        let mut bytes = [0u8; SCENARIO_ID_LEN];
        bytes[..raw.len()].copy_from_slice(raw);
        Some(Self {
            len: raw.len() as u8,
            bytes,
        })
    }

    pub fn as_str(&self) -> &str {
        let n = usize::from(self.len).min(SCENARIO_ID_LEN);
        core::str::from_utf8(&self.bytes[..n]).unwrap_or("")
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, MaxSize)]
pub enum BenchQuery {
    Identity,
    SensorStatus,
    ImuSample,
    BatteryStatus,
    ParamTable,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, MaxSize)]
pub enum GroundCommand {
    Ping {
        nonce: u32,
    },
    ParamRead {
        id: u16,
    },
    ParamWrite {
        id: u16,
        value: f32,
    },
    ParamCount,
    ScenarioLoad {
        id: ScenarioId,
        seed: u32,
    },
    ScenarioStart,
    ScenarioPause,
    ScenarioReset,
    SetPlaybackSpeed {
        permille: u16,
    },
    Bench(BenchQuery),
    Arm,
    Disarm,
    MotorTest {
        motor: u8,
        command_permille: u16,
        duration_ms: u16,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, MaxSize)]
pub enum Rejection {
    UnknownParam,
    OutOfRange,
    NotAllowedOnLink,
    Busy,
    Unsupported,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, MaxSize)]
pub enum GroundReply {
    Pong {
        nonce: u32,
    },
    Param {
        id: u16,
        value: f32,
    },
    ParamCount {
        count: u16,
    },
    Ack,
    Rejected(Rejection),
    Identity {
        protocol: u8,
        imu_who_am_i: u8,
        baro_chip_id: u8,
        firmware_hash: u32,
    },
    SensorStatus {
        imu_ok: bool,
        baro_ok: bool,
        gyro_calibrated: bool,
    },
    ImuSample(ImuRaw),
    BatteryStatus {
        volts: f32,
        amps: f32,
        cells: u8,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, MaxSize)]
pub struct CommandEnvelope {
    pub request_id: u16,
    pub command: GroundCommand,
}

impl Message for CommandEnvelope {
    const KIND: MessageKind = MessageKind::Command;
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, MaxSize)]
pub struct ReplyEnvelope {
    pub request_id: u16,
    pub reply: GroundReply,
}

impl Message for ReplyEnvelope {
    const KIND: MessageKind = MessageKind::Reply;
}
