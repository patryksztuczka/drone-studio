use drone_protocol::ActuatorOutput;
use flight_hal::{Baro, BatteryAdc, Imu, MonotonicClock, MotorOutput, RadioInput};

use crate::controller::{FlightController, Inputs};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TickError {
    Imu,
    Baro,
    Battery,
    Motors,
}

pub struct Peripherals<'a, I, B, A, M, R, C> {
    pub imu: &'a mut I,
    pub baro: &'a mut B,
    pub battery: &'a mut A,
    pub motors: &'a mut M,
    pub radio: &'a mut R,
    pub clock: &'a mut C,
}

pub fn tick<I, B, A, M, R, C>(
    fc: &mut FlightController,
    p: Peripherals<'_, I, B, A, M, R, C>,
) -> Result<ActuatorOutput, TickError>
where
    I: Imu,
    B: Baro,
    A: BatteryAdc,
    M: MotorOutput,
    R: RadioInput,
    C: MonotonicClock,
{
    let inputs = Inputs {
        time_us: p.clock.now_us(),
        imu: p.imu.read().map_err(|_| TickError::Imu)?,
        baro: p.baro.read().map_err(|_| TickError::Baro)?,
        battery: p.battery.read().map_err(|_| TickError::Battery)?,
        rc: p.radio.read(),
    };
    let out = fc.step(&inputs);
    p.motors.write(&out.motors).map_err(|_| TickError::Motors)?;
    Ok(out)
}
