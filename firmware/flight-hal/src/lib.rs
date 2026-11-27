#![no_std]
#![forbid(unsafe_code)]

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct ImuSample {
    pub seq: u32,
    pub gyro_raw: [i16; 3],
    pub accel_raw: [i16; 3],
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct BaroSample {
    pub seq: u32,
    pub pressure_pa: f32,
    pub temperature_c: f32,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct BatterySample {
    pub vbat_raw: u16,
    pub current_raw: u16,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ModeSwitch {
    #[default]
    Angle,
    AltHold,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct RcFrame {
    pub roll: f32,
    pub pitch: f32,
    pub yaw: f32,
    pub throttle: f32,
    pub arm: bool,
    pub mode: ModeSwitch,
}

pub trait Imu {
    type Error;
    fn read(&mut self) -> Result<Option<ImuSample>, Self::Error>;
}

pub trait Baro {
    type Error;
    fn read(&mut self) -> Result<Option<BaroSample>, Self::Error>;
}

pub trait BatteryAdc {
    type Error;
    fn read(&mut self) -> Result<BatterySample, Self::Error>;
}

pub trait MotorOutput {
    type Error;
    fn write(&mut self, commands: &[f32; 4]) -> Result<(), Self::Error>;
}

pub trait RadioInput {
    fn read(&mut self) -> Option<RcFrame>;
}

pub trait MonotonicClock {
    fn now_us(&mut self) -> u64;
}
