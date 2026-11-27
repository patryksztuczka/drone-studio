#[derive(Clone, Copy, Debug, Default)]
pub struct AltitudeEstimator {
    pub altitude_m: f32,
    pub climb_mps: f32,
    pub accel_bias: f32,
    reference_pa: f32,
    primed: bool,
}

pub fn pressure_altitude(pressure_pa: f32, reference_pa: f32) -> f32 {
    44_330.0 * (1.0 - libm::powf(pressure_pa / reference_pa, 0.190_294_96))
}

impl AltitudeEstimator {
    pub fn set_reference(&mut self, reference_pa: f32) {
        self.reference_pa = reference_pa;
        self.altitude_m = 0.0;
        self.climb_mps = 0.0;
        self.accel_bias = 0.0;
        self.primed = true;
    }

    pub fn has_reference(&self) -> bool {
        self.primed
    }

    pub fn predict(&mut self, accel_up: f32, dt: f32) {
        let a = accel_up - self.accel_bias;
        self.altitude_m += self.climb_mps * dt + 0.5 * a * dt * dt;
        self.climb_mps += a * dt;
    }

    pub fn correct(&mut self, pressure_pa: f32, dt_baro: f32, time_constant_s: f32) {
        if !self.primed {
            return;
        }
        let measured = pressure_altitude(pressure_pa, self.reference_pa);
        let e = measured - self.altitude_m;
        let t = time_constant_s;
        self.altitude_m += 3.0 / t * e * dt_baro;
        self.climb_mps += 3.0 / (t * t) * e * dt_baro;
        self.accel_bias -= 1.0 / (t * t * t) * e * dt_baro;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tracks_a_climb_with_biased_accelerometer() {
        let mut e = AltitudeEstimator::default();
        let p0 = 100_000.0;
        e.set_reference(p0);
        let dt = 0.001;
        let mut h = 0.0_f32;
        let mut v = 0.0_f32;
        for i in 0..20_000 {
            let t = i as f32 * dt;
            let a = if t > 2.0 && t < 3.0 {
                1.0
            } else if t > 3.0 && t < 4.0 {
                -1.0
            } else {
                0.0
            };
            v += a * dt;
            h += v * dt;
            e.predict(a + 0.3, dt);
            if i % 20 == 0 {
                let p = p0 * libm::powf(1.0 - h / 44_330.0, 5.255);
                e.correct(p, 0.02, 0.8);
            }
        }
        assert!((e.altitude_m - h).abs() < 0.05, "{} vs {h}", e.altitude_m);
        assert!(e.climb_mps.abs() < 0.05);
        assert!((e.accel_bias - 0.3).abs() < 0.05);
    }
}
