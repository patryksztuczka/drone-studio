use core::convert::Infallible;

use embassy_time::Instant;
use flight_config::AirframeConstants;
use flight_hal::{
    Baro, BaroSample, BatteryAdc, BatterySample, MonotonicClock, RadioInput, RcFrame,
};

pub struct NoBaro;

impl Baro for NoBaro {
    type Error = Infallible;
    fn read(&mut self) -> Result<Option<BaroSample>, Infallible> {
        Ok(None)
    }
}

pub struct FixedBattery(BatterySample);

impl FixedBattery {
    pub fn full(airframe: &AirframeConstants) -> Self {
        let volts = f32::from(airframe.battery_cells) * airframe.cell_full_v;
        #[allow(
            clippy::cast_possible_truncation,
            clippy::cast_sign_loss,
            reason = "a 2S pack over a 0.55 mV/count divider stays far below u16::MAX"
        )]
        let counts = (volts / airframe.vbat_volts_per_count) as u16;
        Self(BatterySample {
            vbat_raw: counts,
            current_raw: 0,
        })
    }
}

impl BatteryAdc for FixedBattery {
    type Error = Infallible;
    fn read(&mut self) -> Result<BatterySample, Infallible> {
        Ok(self.0)
    }
}

pub struct NoRadio;

impl RadioInput for NoRadio {
    fn read(&mut self) -> Option<RcFrame> {
        None
    }
}

pub struct EmbassyClock;

impl MonotonicClock for EmbassyClock {
    fn now_us(&mut self) -> u64 {
        Instant::now().as_micros()
    }
}
