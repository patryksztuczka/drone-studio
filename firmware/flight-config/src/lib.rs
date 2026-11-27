#![no_std]
#![forbid(unsafe_code)]

#[rustfmt::skip]
#[allow(clippy::all)]
pub mod generated;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AirframeConstants {
    pub id: &'static str,
    pub source_hash: &'static str,
    pub board: &'static str,
    pub mcu: &'static str,
    pub physics_hz: u32,
    pub control_hz: u32,
    pub telemetry_hz: u32,
    pub rotor_ids: [&'static str; 4],
    pub mixer: [[f32; 3]; 4],
    pub imu_body_from_sensor: [[f32; 3]; 3],
    pub gyro_lsb_per_dps: f32,
    pub accel_lsb_per_g: f32,
    pub imu_odr_hz: f32,
    pub imu_who_am_i_register: u8,
    pub imu_who_am_i: u8,
    pub imu_spi_hz: u32,
    pub baro_i2c_address: u8,
    pub baro_chip_id_register: u8,
    pub baro_chip_id: u8,
    pub vbat_volts_per_count: f32,
    pub current_amps_per_count: f32,
    pub current_offset_counts: f32,
    pub battery_cells: u8,
    pub battery_capacity_mah: f32,
    pub cell_full_v: f32,
    pub cell_warning_v: f32,
    pub cell_critical_v: f32,
    pub cell_empty_v: f32,
    pub max_tilt_deg: f32,
    pub max_rate_dps: [f32; 3],
    pub max_climb_mps: f32,
    pub mass_kg: f32,
    pub inertia_diag_kg_m2: [f32; 3],
    pub hover_thrust_fraction: f32,
    pub max_thrust_per_rotor_n: f32,
    pub motor_pwm_hz: u32,
    pub hse_hz: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BoardPins {
    pub imu_spi: &'static str,
    pub imu_sck: &'static str,
    pub imu_miso: &'static str,
    pub imu_mosi: &'static str,
    pub imu_cs: &'static str,
    pub imu_int: &'static str,
    pub baro_i2c: &'static str,
    pub motor_pins: [&'static str; 4],
    pub motor_timer_channels: [(&'static str, u8); 4],
    pub vbat_pin: &'static str,
    pub current_pin: &'static str,
}

pub use generated::palm_x4_2in;

pub const DEFAULT: &AirframeConstants = &palm_x4_2in::AIRFRAME;

pub fn by_id(id: &str) -> Option<&'static AirframeConstants> {
    generated::ALL.iter().copied().find(|a| a.id == id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mixer_rows_balance() {
        let m = DEFAULT.mixer;
        for axis in 0..3 {
            let sum: f32 = m.iter().map(|row| row[axis]).sum();
            assert!(sum.abs() < 0.05, "axis {axis} sum {sum}");
        }
    }

    #[test]
    fn imu_rotation_is_orthonormal() {
        let r = DEFAULT.imu_body_from_sensor;
        for i in 0..3 {
            for j in 0..3 {
                let dot: f32 = (0..3).map(|k| r[i][k] * r[j][k]).sum();
                let expected = if i == j { 1.0 } else { 0.0 };
                assert!((dot - expected).abs() < 1e-5);
            }
        }
    }
}
