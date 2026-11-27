#![no_std]
#![no_main]

mod board;
mod clocks;
mod imu;
mod log;
mod motors;

use embassy_executor::Spawner;
use embassy_stm32::gpio::{Level, Output, OutputType, Speed};
use embassy_stm32::spi::{self, Spi};
use embassy_stm32::time::Hertz;
use embassy_stm32::timer::low_level::CountingMode;
use embassy_stm32::timer::simple_pwm::{PwmPin, SimplePwm};
use embassy_stm32::usart::{self, UartTx};
use embassy_time::{Duration, Ticker};
use flight_core::FlightController;
use flight_core::runtime::{Peripherals, tick};
use panic_halt as _;

use crate::board::{EmbassyClock, FixedBattery, NoBaro, NoRadio};
use crate::imu::Icm42688p;
use crate::log::Log;
use crate::motors::PwmMotors;

const TELEMETRY_BAUD: u32 = 921_600;
const STATUS_EVERY: u32 = 100;

#[embassy_executor::main]
async fn main(_spawner: Spawner) {
    let airframe = flight_config::DEFAULT;
    let p = embassy_stm32::init(clocks::config(airframe.hse_hz));

    let (uart, _rx, tx) = flight_config::ref_h743_aio_telemetry_uart!(p);
    let mut uart_config = usart::Config::default();
    uart_config.baudrate = TELEMETRY_BAUD;
    let Ok(tx) = UartTx::new_blocking(uart, tx, uart_config) else {
        park();
    };
    let mut log = Log::new(tx);
    log.line(format_args!(
        "BOOT {} board={} mcu={} source={}",
        airframe.id, airframe.board, airframe.mcu, airframe.source_hash
    ));

    let mut led = Output::new(
        flight_config::ref_h743_aio_status_led!(p),
        Level::Low,
        Speed::Low,
    );

    let (spi1, sck, mosi, miso, cs) = flight_config::ref_h743_aio_imu_spi!(p);
    let mut spi_config = spi::Config::default();
    spi_config.frequency = Hertz(airframe.imu_spi_hz);
    let spi = Spi::new_blocking(spi1, sck, mosi, miso, spi_config);
    let cs = Output::new(cs, Level::High, Speed::VeryHigh);
    let mut imu = Icm42688p::new(spi, cs);

    match imu.probe(airframe.imu_who_am_i_register, airframe.imu_who_am_i) {
        Ok(id) => log.line(format_args!("IMU WHO_AM_I=0x{id:02X} OK")),
        Err(e) => {
            log.line(format_args!(
                "IMU WHO_AM_I FAIL expected=0x{:02X} error={e:?}",
                airframe.imu_who_am_i
            ));
            park();
        }
    }
    match imu.configure() {
        Ok(()) => log.line(format_args!("IMU CONFIG OK odr_hz={}", airframe.imu_odr_hz)),
        Err(e) => {
            log.line(format_args!("IMU CONFIG FAIL error={e:?}"));
            park();
        }
    }

    let pwm_hz = Hertz(airframe.motor_pwm_hz);
    let (tim3, m1, m2) = flight_config::ref_h743_aio_motor_timer_0!(p);
    let (tim5, m3, m4) = flight_config::ref_h743_aio_motor_timer_1!(p);
    let tim3 = SimplePwm::new(
        tim3,
        None,
        None,
        Some(PwmPin::new(m1, OutputType::PushPull)),
        Some(PwmPin::new(m2, OutputType::PushPull)),
        pwm_hz,
        CountingMode::EdgeAlignedUp,
    );
    let tim5 = SimplePwm::new(
        tim5,
        Some(PwmPin::new(m3, OutputType::PushPull)),
        Some(PwmPin::new(m4, OutputType::PushPull)),
        None,
        None,
        pwm_hz,
        CountingMode::EdgeAlignedUp,
    );
    let mut motors = PwmMotors::new(tim3, tim5);
    log.line(format_args!(
        "MOTORS PWM hz={} outputs=4 duty=0",
        airframe.motor_pwm_hz
    ));

    let mut fc = FlightController::new(airframe);
    let mut baro = NoBaro;
    let mut battery = FixedBattery::full(airframe);
    let mut radio = NoRadio;
    let mut clock = EmbassyClock;

    log.line(format_args!("LOOP START hz={}", airframe.control_hz));
    let mut ticker = Ticker::every(Duration::from_hz(u64::from(airframe.control_hz)));
    let mut ticks: u32 = 0;
    let mut errors: u32 = 0;
    loop {
        ticker.next().await;
        let result = tick(
            &mut fc,
            Peripherals {
                imu: &mut imu,
                baro: &mut baro,
                battery: &mut battery,
                motors: &mut motors,
                radio: &mut radio,
                clock: &mut clock,
            },
        );
        ticks = ticks.wrapping_add(1);
        match result {
            Ok(out) => {
                for record in out.logs() {
                    log.line(format_args!(
                        "FC {:?} {:?} {} {}",
                        record.level, record.code, record.args[0], record.args[1]
                    ));
                }
                if ticks.is_multiple_of(STATUS_EVERY) {
                    led.toggle();
                    let s = imu.last;
                    let d = motors.last_duty;
                    log.line(format_args!(
                        "LOOP {ticks} arm={:?} status=0x{:04X} imu_reads={} motor_writes={} duty={},{},{},{} gyro={},{},{} accel={},{},{} errors={errors}",
                        out.arm_state,
                        out.status,
                        imu.reads,
                        motors.writes,
                        d[0],
                        d[1],
                        d[2],
                        d[3],
                        s.gyro_raw[0],
                        s.gyro_raw[1],
                        s.gyro_raw[2],
                        s.accel_raw[0],
                        s.accel_raw[1],
                        s.accel_raw[2],
                    ));
                }
            }
            Err(e) => {
                errors = errors.wrapping_add(1);
                if errors == 1 || errors.is_multiple_of(STATUS_EVERY) {
                    log.line(format_args!("TICK {ticks} ERROR {e:?} count={errors}"));
                }
            }
        }
    }
}

fn park() -> ! {
    loop {
        cortex_m::asm::wfi();
    }
}
