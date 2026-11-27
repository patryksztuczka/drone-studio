use embassy_stm32::gpio::Output;
use embassy_stm32::mode::Blocking;
use embassy_stm32::spi::{self, Spi};
use embassy_time::{Duration, block_for};
use flight_hal::{Imu, ImuSample};

const READ: u8 = 0x80;
const DEVICE_CONFIG: u8 = 0x11;
const ACCEL_DATA_X1: u8 = 0x1F;
const PWR_MGMT0: u8 = 0x4E;
const GYRO_CONFIG0: u8 = 0x4F;
const ACCEL_CONFIG0: u8 = 0x50;
const SOFT_RESET: u8 = 0x01;
const GYRO_LN_ACCEL_LN: u8 = 0x0F;
const FS_MAX_ODR_1KHZ: u8 = 0x06;
const RESET_SETTLE: Duration = Duration::from_millis(1);
const POWER_SETTLE: Duration = Duration::from_millis(1);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ImuError {
    Bus(spi::Error),
    WhoAmI(u8),
    Config { register: u8, wrote: u8, read: u8 },
}

impl From<spi::Error> for ImuError {
    fn from(e: spi::Error) -> Self {
        Self::Bus(e)
    }
}

pub struct Icm42688p<'d> {
    spi: Spi<'d, Blocking, spi::mode::Master>,
    cs: Output<'d>,
    seq: u32,
    pub reads: u32,
    pub last: ImuSample,
}

impl<'d> Icm42688p<'d> {
    pub fn new(spi: Spi<'d, Blocking, spi::mode::Master>, cs: Output<'d>) -> Self {
        Self {
            spi,
            cs,
            seq: 0,
            reads: 0,
            last: ImuSample::default(),
        }
    }

    fn transfer(&mut self, buf: &mut [u8]) -> Result<(), spi::Error> {
        self.cs.set_low();
        let result = self.spi.blocking_transfer_in_place(buf);
        self.cs.set_high();
        result
    }

    pub fn read_register(&mut self, register: u8) -> Result<u8, spi::Error> {
        let mut buf = [register | READ, 0];
        self.transfer(&mut buf)?;
        Ok(buf[1])
    }

    fn write_register(&mut self, register: u8, value: u8) -> Result<(), spi::Error> {
        let mut buf = [register & !READ, value];
        self.transfer(&mut buf)
    }

    fn write_checked(&mut self, register: u8, value: u8) -> Result<(), ImuError> {
        self.write_register(register, value)?;
        let read = self.read_register(register)?;
        if read == value {
            Ok(())
        } else {
            Err(ImuError::Config {
                register,
                wrote: value,
                read,
            })
        }
    }

    pub fn probe(&mut self, register: u8, expected: u8) -> Result<u8, ImuError> {
        let id = self.read_register(register)?;
        if id == expected {
            Ok(id)
        } else {
            Err(ImuError::WhoAmI(id))
        }
    }

    pub fn configure(&mut self) -> Result<(), ImuError> {
        self.write_register(DEVICE_CONFIG, SOFT_RESET)?;
        block_for(RESET_SETTLE);
        self.write_checked(GYRO_CONFIG0, FS_MAX_ODR_1KHZ)?;
        self.write_checked(ACCEL_CONFIG0, FS_MAX_ODR_1KHZ)?;
        self.write_checked(PWR_MGMT0, GYRO_LN_ACCEL_LN)?;
        block_for(POWER_SETTLE);
        Ok(())
    }
}

fn be(bytes: &[u8]) -> i16 {
    match bytes {
        [hi, lo, ..] => i16::from_be_bytes([*hi, *lo]),
        _ => 0,
    }
}

impl Imu for Icm42688p<'_> {
    type Error = spi::Error;

    fn read(&mut self) -> Result<Option<ImuSample>, spi::Error> {
        let mut buf = [0u8; 13];
        buf[0] = ACCEL_DATA_X1 | READ;
        self.transfer(&mut buf)?;
        let d = &buf[1..];
        self.seq = self.seq.wrapping_add(1);
        self.reads = self.reads.wrapping_add(1);
        let sample = ImuSample {
            seq: self.seq,
            accel_raw: [be(&d[0..]), be(&d[2..]), be(&d[4..])],
            gyro_raw: [be(&d[6..]), be(&d[8..]), be(&d[10..])],
        };
        self.last = sample;
        Ok(Some(sample))
    }
}
