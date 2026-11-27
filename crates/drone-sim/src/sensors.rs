use std::collections::VecDeque;

use crate::math::{Mat3, Vec3};
use crate::model::{AdcModel, BaroModel, ImuModel, VibrationModel};
use crate::rng::Rng;

const DEG: f64 = core::f64::consts::PI / 180.0;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct ImuSample {
    pub seq: u32,
    pub gyro_raw: [i16; 3],
    pub accel_raw: [i16; 3],
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct BaroSample {
    pub seq: u32,
    pub pressure_pa: f64,
    pub temperature_c: f64,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct AdcSample {
    pub vbat_raw: u16,
    pub current_raw: u16,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct SensorFrame {
    pub time_us: u64,
    pub imu: ImuSample,
    pub baro: BaroSample,
    pub adc: AdcSample,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct ImuTruth {
    pub gyro_body: Vec3,
    pub specific_force_body: Vec3,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct VibrationInput {
    pub rotor_phase: [f64; 4],
    pub rotor_load: [f64; 4],
}

#[derive(Clone, Debug)]
pub struct ImuSim {
    model: ImuModel,
    vibration: VibrationModel,
    sensor_from_body: Mat3,
    delay: VecDeque<ImuTruth>,
    delay_steps: usize,
    period_s: f64,
    next_sample_s: f64,
    gyro_bias_dps: Vec3,
    accel_bias_mps2: Vec3,
    pub injected_gyro_bias_dps: Vec3,
    rng: Rng,
    pub sample: ImuSample,
    pub clean_gyro_dps: Vec3,
    pub clean_accel_mps2: Vec3,
}

fn quantize(value: f64, lsb_per_unit: f64, range: f64) -> i16 {
    let limited = value.clamp(-range, range);
    let counts = libm::round(limited * lsb_per_unit);
    counts.clamp(f64::from(i16::MIN), f64::from(i16::MAX)) as i16
}

impl ImuSim {
    pub fn new(
        model: &ImuModel,
        vibration: &VibrationModel,
        physics_dt: f64,
        mut rng: Rng,
    ) -> Self {
        let gyro_bias_dps = Vec3::new(rng.gaussian(), rng.gaussian(), rng.gaussian())
            * model.gyro_bias_instability_dps;
        let accel_bias_mps2 = Vec3::new(rng.gaussian(), rng.gaussian(), rng.gaussian())
            * (model.accel_bias_instability_mg * 1e-3 * crate::atmosphere::G0);
        let delay_steps = libm::round(model.latency_s / physics_dt) as usize;
        Self {
            model: model.clone(),
            vibration: vibration.clone(),
            sensor_from_body: Mat3::new(model.sensor_from_body),
            delay: VecDeque::with_capacity(delay_steps + 1),
            delay_steps,
            period_s: 1.0 / model.odr_hz,
            next_sample_s: 0.0,
            gyro_bias_dps,
            accel_bias_mps2,
            injected_gyro_bias_dps: Vec3::ZERO,
            rng,
            sample: ImuSample::default(),
            clean_gyro_dps: Vec3::ZERO,
            clean_accel_mps2: Vec3::ZERO,
        }
    }

    pub fn step(&mut self, t: f64, dt: f64, truth: ImuTruth, vib: &VibrationInput) -> bool {
        self.delay.push_back(truth);
        while self.delay.len() > self.delay_steps + 1 {
            self.delay.pop_front();
        }
        let walk = self.model.gyro_bias_random_walk_dps_rthz * libm::sqrt(dt);
        self.gyro_bias_dps += Vec3::new(
            self.rng.gaussian(),
            self.rng.gaussian(),
            self.rng.gaussian(),
        ) * walk;
        if t + 1e-12 < self.next_sample_s {
            return false;
        }
        self.next_sample_s += self.period_s;
        let delayed = self.delay.front().copied().unwrap_or(truth);
        let bandwidth = libm::sqrt(self.model.odr_hz * 0.5);
        let gyro_sigma = self.model.gyro_noise_density_dps_rthz * bandwidth;
        let accel_sigma =
            self.model.accel_noise_density_ug_rthz * 1e-6 * crate::atmosphere::G0 * bandwidth;
        let mut vib_gyro = Vec3::ZERO;
        let mut vib_accel = Vec3::ZERO;
        let mut load_sum = 0.0;
        for i in 0..4 {
            let load = vib.rotor_load[i];
            load_sum += load;
            let p = vib.rotor_phase[i];
            let s = Vec3::new(libm::sin(p), libm::cos(p), libm::sin(p + 0.7 * i as f64));
            vib_gyro += s * (self.vibration.rotor_imbalance_gyro_dps * load * load);
            vib_accel += s * (self.vibration.rotor_imbalance_accel_mps2 * load * load);
        }
        let mean_load = load_sum / 4.0;
        let broadband = |rng: &mut Rng, amp: f64| {
            Vec3::new(rng.gaussian(), rng.gaussian(), rng.gaussian()) * (amp * mean_load)
        };
        let bb_gyro = broadband(&mut self.rng, self.vibration.broadband_gyro_dps);
        let bb_accel = broadband(&mut self.rng, self.vibration.broadband_accel_mps2);
        let gyro_body_dps = delayed.gyro_body / DEG;
        let gyro_sensor = self.sensor_from_body.mul_vec(gyro_body_dps);
        let accel_sensor = self.sensor_from_body.mul_vec(delayed.specific_force_body);
        self.clean_gyro_dps = gyro_body_dps;
        self.clean_accel_mps2 = delayed.specific_force_body;
        let noise_g = Vec3::new(
            self.rng.gaussian(),
            self.rng.gaussian(),
            self.rng.gaussian(),
        ) * gyro_sigma;
        let noise_a = Vec3::new(
            self.rng.gaussian(),
            self.rng.gaussian(),
            self.rng.gaussian(),
        ) * accel_sigma;
        let gyro = gyro_sensor
            + self.gyro_bias_dps
            + self.injected_gyro_bias_dps
            + noise_g
            + vib_gyro
            + bb_gyro;
        let accel_g = (accel_sensor + self.accel_bias_mps2 + noise_a + vib_accel + bb_accel)
            / crate::atmosphere::G0;
        let gr = self.model.gyro_range_dps;
        let ar = self.model.accel_range_g;
        self.sample = ImuSample {
            seq: self.sample.seq.wrapping_add(1),
            gyro_raw: [
                quantize(gyro.x, self.model.gyro_lsb_per_dps, gr),
                quantize(gyro.y, self.model.gyro_lsb_per_dps, gr),
                quantize(gyro.z, self.model.gyro_lsb_per_dps, gr),
            ],
            accel_raw: [
                quantize(accel_g.x, self.model.accel_lsb_per_g, ar),
                quantize(accel_g.y, self.model.accel_lsb_per_g, ar),
                quantize(accel_g.z, self.model.accel_lsb_per_g, ar),
            ],
        };
        true
    }
}

#[derive(Clone, Debug)]
pub struct BaroSim {
    model: BaroModel,
    period_s: f64,
    next_sample_s: f64,
    delay: VecDeque<(f64, f64)>,
    delay_steps: usize,
    rng: Rng,
    pub sample: BaroSample,
}

impl BaroSim {
    pub fn new(model: &BaroModel, physics_dt: f64, rng: Rng) -> Self {
        let delay_steps = libm::round(model.latency_s / physics_dt) as usize;
        Self {
            model: model.clone(),
            period_s: 1.0 / model.odr_hz,
            next_sample_s: 0.0,
            delay: VecDeque::with_capacity(delay_steps + 1),
            delay_steps,
            rng,
            sample: BaroSample::default(),
        }
    }

    pub fn step(&mut self, t: f64, pressure_pa: f64, temperature_c: f64) -> bool {
        self.delay.push_back((pressure_pa, temperature_c));
        while self.delay.len() > self.delay_steps + 1 {
            self.delay.pop_front();
        }
        if t + 1e-12 < self.next_sample_s {
            return false;
        }
        self.next_sample_s += self.period_s;
        let (p, temp) = self
            .delay
            .front()
            .copied()
            .unwrap_or((pressure_pa, temperature_c));
        self.sample = BaroSample {
            seq: self.sample.seq.wrapping_add(1),
            pressure_pa: p + self.rng.gaussian() * self.model.pressure_noise_pa,
            temperature_c: temp + self.rng.gaussian() * self.model.temperature_noise_c,
        };
        true
    }
}

#[derive(Clone, Debug)]
pub struct AdcSim {
    model: AdcModel,
    rng: Rng,
    pub sample: AdcSample,
}

impl AdcSim {
    pub fn new(model: &AdcModel, rng: Rng) -> Self {
        Self {
            model: model.clone(),
            rng,
            sample: AdcSample::default(),
        }
    }

    fn counts(&mut self, volts: f64) -> u16 {
        let full = f64::from((1u32 << self.model.bits) - 1);
        let noise = self.rng.gaussian() * full * 2e-4;
        let c = libm::round(volts / self.model.reference_v * full + noise);
        c.clamp(0.0, full) as u16
    }

    pub fn step(&mut self, battery_v: f64, current_a: f64) {
        let vbat = battery_v / self.model.vbat_divider_ratio;
        let cur = current_a * self.model.current_scale_v_per_a + self.model.current_offset_v;
        self.sample = AdcSample {
            vbat_raw: self.counts(vbat),
            current_raw: self.counts(cur),
        };
    }
}
