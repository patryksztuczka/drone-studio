#[derive(Clone, Copy, Debug, Default)]
pub struct Pt1 {
    alpha: f32,
    pub state: f32,
    primed: bool,
}

impl Pt1 {
    pub fn new(cutoff_hz: f32, dt: f32) -> Self {
        let mut f = Self::default();
        f.set_cutoff(cutoff_hz, dt);
        f
    }

    pub fn set_cutoff(&mut self, cutoff_hz: f32, dt: f32) {
        let rc = 1.0 / (2.0 * core::f32::consts::PI * cutoff_hz.max(0.01));
        self.alpha = dt / (rc + dt);
    }

    pub fn apply(&mut self, x: f32) -> f32 {
        if !self.primed {
            self.state = x;
            self.primed = true;
        }
        self.state += self.alpha * (x - self.state);
        self.state
    }

    pub fn reset(&mut self, x: f32) {
        self.state = x;
        self.primed = true;
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Pt1x3 {
    f: [Pt1; 3],
}

impl Pt1x3 {
    pub fn new(cutoff_hz: f32, dt: f32) -> Self {
        Self {
            f: [Pt1::new(cutoff_hz, dt); 3],
        }
    }

    pub fn set_cutoff(&mut self, cutoff_hz: f32, dt: f32) {
        for f in &mut self.f {
            f.set_cutoff(cutoff_hz, dt);
        }
    }

    pub fn apply(&mut self, v: crate::math::V3) -> crate::math::V3 {
        crate::math::V3::new(
            self.f[0].apply(v.x),
            self.f[1].apply(v.y),
            self.f[2].apply(v.z),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::Pt1;

    #[test]
    fn pt1_attenuates_above_cutoff() {
        let dt = 0.001;
        let mut f = Pt1::new(20.0, dt);
        let mut peak: f32 = 0.0;
        for i in 0..5000 {
            let x = libm::sinf(2.0 * core::f32::consts::PI * 200.0 * i as f32 * dt);
            let y = f.apply(x);
            if i > 1000 {
                peak = peak.max(y.abs());
            }
        }
        assert!(peak < 0.15, "{peak}");
    }
}
