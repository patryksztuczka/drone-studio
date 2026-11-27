use serde::{Deserialize, Serialize};

use crate::math::Vec3;
use crate::rng::Rng;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Turbulence {
    #[default]
    None,
    Light,
    Moderate,
    Severe,
}

impl Turbulence {
    pub const fn sigma_mps(self) -> f64 {
        match self {
            Self::None => 0.0,
            Self::Light => 0.35,
            Self::Moderate => 0.9,
            Self::Severe => 1.8,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Gust {
    pub start_s: f64,
    pub duration_s: f64,
    pub ramp_s: f64,
    pub velocity_mps: [f64; 3],
}

impl Gust {
    pub fn envelope(&self, t: f64) -> f64 {
        let local = t - self.start_s;
        if local <= 0.0 || local >= self.duration_s + self.ramp_s {
            return 0.0;
        }
        let ramp = self.ramp_s.max(1e-6);
        let half_cos = |x: f64| 0.5 * (1.0 - libm::cos(core::f64::consts::PI * x.clamp(0.0, 1.0)));
        if local < ramp {
            half_cos(local / ramp)
        } else if local > self.duration_s {
            1.0 - half_cos((local - self.duration_s) / ramp)
        } else {
            1.0
        }
    }
}

#[derive(Clone, Debug)]
pub struct WindField {
    steady: Vec3,
    gusts: Vec<Gust>,
    turbulence: Turbulence,
    dryden: Vec3,
    rng: Rng,
    length_scale_m: f64,
}

impl WindField {
    pub fn new(steady: Vec3, gusts: Vec<Gust>, turbulence: Turbulence, rng: Rng) -> Self {
        Self {
            steady,
            gusts,
            turbulence,
            dryden: Vec3::ZERO,
            rng,
            length_scale_m: 12.0,
        }
    }

    pub fn gust_active(&self, t: f64) -> bool {
        self.gusts.iter().any(|g| g.envelope(t) > 0.0)
    }

    pub fn step(&mut self, t: f64, airspeed_mps: f64, dt: f64) -> Vec3 {
        let sigma = self.turbulence.sigma_mps();
        if sigma > 0.0 {
            let v = airspeed_mps.max(1.0);
            let a = v / self.length_scale_m;
            let decay = libm::exp(-a * dt);
            let drive = sigma * libm::sqrt(1.0 - decay * decay);
            let noise = Vec3::new(
                self.rng.gaussian(),
                self.rng.gaussian(),
                self.rng.gaussian() * 0.5,
            );
            self.dryden = self.dryden * decay + noise * drive;
        }
        let gust = self.gusts.iter().fold(Vec3::ZERO, |acc, g| {
            acc + Vec3::from_array(g.velocity_mps) * g.envelope(t)
        });
        self.steady + gust + self.dryden
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gust_envelope_shape() {
        let g = Gust {
            start_s: 1.0,
            duration_s: 2.0,
            ramp_s: 0.5,
            velocity_mps: [0.0, 6.0, 0.0],
        };
        assert_eq!(g.envelope(0.5), 0.0);
        assert!((g.envelope(1.25) - 0.5).abs() < 1e-12);
        assert_eq!(g.envelope(2.0), 1.0);
        assert!((g.envelope(3.25) - 0.5).abs() < 1e-12);
        assert_eq!(g.envelope(4.0), 0.0);
    }

    #[test]
    fn turbulence_has_requested_spread() {
        let mut w = WindField::new(Vec3::ZERO, vec![], Turbulence::Moderate, Rng::new(3));
        let n = 400_000;
        let mut sum = 0.0;
        for i in 0..n {
            let v = w.step(i as f64 * 0.0005, 3.0, 0.0005);
            sum += v.x * v.x;
        }
        let rms = (sum / n as f64).sqrt();
        assert!((rms - 0.9).abs() < 0.25, "{rms}");
    }
}
