use core::convert::Infallible;

use embassy_stm32::peripherals::{TIM3, TIM5};
use embassy_stm32::timer::simple_pwm::SimplePwm;
use flight_hal::MotorOutput;

pub struct PwmMotors<'d> {
    tim3: SimplePwm<'d, TIM3>,
    tim5: SimplePwm<'d, TIM5>,
    pub writes: u32,
    pub last_duty: [u32; 4],
}

fn duty(command: f32, max: u32) -> u32 {
    let clamped = if command.is_nan() {
        0.0
    } else {
        command.clamp(0.0, 1.0)
    };
    #[allow(
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss,
        clippy::cast_precision_loss,
        reason = "clamped to [0, 1] and max is a 16- or 32-bit timer period"
    )]
    let d = (clamped * max as f32) as u32;
    d.min(max)
}

impl<'d> PwmMotors<'d> {
    pub fn new(mut tim3: SimplePwm<'d, TIM3>, mut tim5: SimplePwm<'d, TIM5>) -> Self {
        tim3.ch3().set_duty_cycle_fully_off();
        tim3.ch4().set_duty_cycle_fully_off();
        tim5.ch1().set_duty_cycle_fully_off();
        tim5.ch2().set_duty_cycle_fully_off();
        tim3.ch3().enable();
        tim3.ch4().enable();
        tim5.ch1().enable();
        tim5.ch2().enable();
        Self {
            tim3,
            tim5,
            writes: 0,
            last_duty: [0; 4],
        }
    }
}

impl MotorOutput for PwmMotors<'_> {
    type Error = Infallible;

    fn write(&mut self, commands: &[f32; 4]) -> Result<(), Infallible> {
        let max3 = self.tim3.max_duty_cycle();
        let max5 = self.tim5.max_duty_cycle();
        let d = [
            duty(commands[0], max3),
            duty(commands[1], max3),
            duty(commands[2], max5),
            duty(commands[3], max5),
        ];
        self.tim3.ch3().set_duty_cycle(d[0]);
        self.tim3.ch4().set_duty_cycle(d[1]);
        self.tim5.ch1().set_duty_cycle(d[2]);
        self.tim5.ch2().set_duty_cycle(d[3]);
        self.last_duty = d;
        self.writes = self.writes.wrapping_add(1);
        Ok(())
    }
}
