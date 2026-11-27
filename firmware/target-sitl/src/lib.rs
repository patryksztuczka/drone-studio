#![forbid(unsafe_code)]

use core::convert::Infallible;

use drone_protocol::frame::DecodeError;
use drone_protocol::{
    ActuatorOutput, FlightModeRequest, Integrity, SimStepInput, decode_frame, encode_frame,
};
use flight_config::AirframeConstants;
use flight_core::runtime::{Peripherals, tick};
use flight_core::{FlightController, ParamError, Telemetry};
use flight_hal::{
    Baro, BaroSample, BatteryAdc, BatterySample, Imu, ImuSample, ModeSwitch, MonotonicClock,
    MotorOutput, RadioInput, RcFrame,
};

#[derive(Default)]
struct SitlImu(Option<ImuSample>);
#[derive(Default)]
struct SitlBaro(Option<BaroSample>);
#[derive(Default)]
struct SitlAdc(BatterySample);
#[derive(Default)]
struct SitlMotors([f32; 4]);
#[derive(Default)]
struct SitlRadio(Option<RcFrame>);
#[derive(Default)]
struct SitlClock(u64);

impl Imu for SitlImu {
    type Error = Infallible;
    fn read(&mut self) -> Result<Option<ImuSample>, Infallible> {
        Ok(self.0.take())
    }
}

impl Baro for SitlBaro {
    type Error = Infallible;
    fn read(&mut self) -> Result<Option<BaroSample>, Infallible> {
        Ok(self.0.take())
    }
}

impl BatteryAdc for SitlAdc {
    type Error = Infallible;
    fn read(&mut self) -> Result<BatterySample, Infallible> {
        Ok(self.0)
    }
}

impl MotorOutput for SitlMotors {
    type Error = Infallible;
    fn write(&mut self, commands: &[f32; 4]) -> Result<(), Infallible> {
        self.0 = *commands;
        Ok(())
    }
}

impl RadioInput for SitlRadio {
    fn read(&mut self) -> Option<RcFrame> {
        self.0.take()
    }
}

impl MonotonicClock for SitlClock {
    fn now_us(&mut self) -> u64 {
        self.0
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum SitlError {
    Wire(DecodeError),
    Encode,
    Tick,
}

pub struct SitlTarget {
    fc: FlightController,
    wire: bool,
    imu: SitlImu,
    baro: SitlBaro,
    adc: SitlAdc,
    motors: SitlMotors,
    radio: SitlRadio,
    clock: SitlClock,
    buf: Vec<u8>,
    pub bytes_on_wire: u64,
}

fn through_wire<T: drone_protocol::Message + Copy>(
    msg: &T,
    buf: &mut Vec<u8>,
    bytes: &mut u64,
) -> Result<T, SitlError> {
    buf.resize(drone_protocol::frame::max_frame_len::<T>() + 8, 0);
    let n = encode_frame(msg, Integrity::Crc16, buf).map_err(|_| SitlError::Encode)?;
    *bytes += n as u64;
    let frame = decode_frame(&mut buf[..n - 1]).map_err(SitlError::Wire)?;
    frame.parse::<T>().map_err(SitlError::Wire)
}

impl SitlTarget {
    pub fn new(airframe: &'static AirframeConstants) -> Self {
        Self {
            fc: FlightController::new(airframe),
            wire: true,
            imu: SitlImu::default(),
            baro: SitlBaro::default(),
            adc: SitlAdc::default(),
            motors: SitlMotors::default(),
            radio: SitlRadio::default(),
            clock: SitlClock::default(),
            buf: Vec::new(),
            bytes_on_wire: 0,
        }
    }

    pub fn with_wire(mut self, wire: bool) -> Self {
        self.wire = wire;
        self
    }

    pub fn set_param(&mut self, name: &str, value: f32) -> Result<(), ParamError> {
        self.fc.params.set_by_name(name, value)?;
        self.fc.apply_params();
        Ok(())
    }

    pub fn controller(&self) -> &FlightController {
        &self.fc
    }

    pub fn telemetry(&self) -> &Telemetry {
        self.fc.telemetry()
    }

    pub fn step(&mut self, input: &SimStepInput) -> Result<ActuatorOutput, SitlError> {
        let input = if self.wire {
            through_wire(input, &mut self.buf, &mut self.bytes_on_wire)?
        } else {
            *input
        };
        self.clock.0 = input.time_us;
        self.imu.0 = Some(ImuSample {
            seq: input.imu.seq,
            gyro_raw: input.imu.gyro,
            accel_raw: input.imu.accel,
        });
        self.baro.0 = (input.baro.seq > 0).then_some(BaroSample {
            seq: input.baro.seq,
            pressure_pa: input.baro.pressure_pa,
            temperature_c: input.baro.temperature_c,
        });
        self.adc.0 = BatterySample {
            vbat_raw: input.battery.vbat_raw,
            current_raw: input.battery.current_raw,
        };
        self.radio.0 = input.rc.valid.then_some(RcFrame {
            roll: input.rc.roll,
            pitch: input.rc.pitch,
            yaw: input.rc.yaw,
            throttle: input.rc.throttle,
            arm: input.rc.arm,
            mode: match input.rc.mode {
                FlightModeRequest::Angle => ModeSwitch::Angle,
                FlightModeRequest::AltHold => ModeSwitch::AltHold,
            },
        });
        let out = tick(
            &mut self.fc,
            Peripherals {
                imu: &mut self.imu,
                baro: &mut self.baro,
                battery: &mut self.adc,
                motors: &mut self.motors,
                radio: &mut self.radio,
                clock: &mut self.clock,
            },
        )
        .map_err(|_| SitlError::Tick)?;
        if self.wire {
            through_wire(&out, &mut self.buf, &mut self.bytes_on_wire)
        } else {
            Ok(out)
        }
    }
}
