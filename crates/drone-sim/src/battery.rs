use crate::model::BatteryModel;

#[derive(Clone, Debug, PartialEq)]
pub struct Battery {
    model: BatteryModel,
    pub soc: f64,
    pub polarization_v: f64,
    pub current_a: f64,
    pub voltage_v: f64,
    pub consumed_mah: f64,
    decay_dt: f64,
    decay: f64,
}

impl Battery {
    pub fn new(model: &BatteryModel, soc: f64) -> Self {
        let mut b = Self {
            model: model.clone(),
            soc: soc.clamp(0.0, 1.0),
            polarization_v: 0.0,
            current_a: 0.0,
            voltage_v: 0.0,
            consumed_mah: 0.0,
            decay_dt: 0.0,
            decay: 1.0,
        };
        b.voltage_v = b.open_circuit_voltage();
        b
    }

    pub fn open_circuit_voltage(&self) -> f64 {
        ocv_cell(&self.model.ocv_curve, self.soc) * f64::from(self.model.cells)
    }

    pub fn step(&mut self, load_current_a: f64, dt: f64) {
        let i = load_current_a.max(0.0);
        self.current_a = i;
        let charge_ah = i * dt / 3600.0;
        self.consumed_mah += charge_ah * 1000.0;
        self.soc = (self.soc - charge_ah / self.model.capacity_ah).max(0.0);
        let tau = self.model.r1_ohm * self.model.c1_f;
        if tau > 0.0 {
            if dt != self.decay_dt {
                self.decay_dt = dt;
                self.decay = libm::exp(-dt / tau);
            }
            let a = self.decay;
            self.polarization_v = self.polarization_v * a + i * self.model.r1_ohm * (1.0 - a);
        }
        self.voltage_v =
            (self.open_circuit_voltage() - i * self.model.r0_ohm - self.polarization_v).max(0.0);
    }
}

pub fn ocv_cell(curve: &[[f64; 2]], soc: f64) -> f64 {
    let Some(first) = curve.first() else {
        return 0.0;
    };
    if soc <= first[0] {
        return first[1];
    }
    for pair in curve.windows(2) {
        let (a, b) = (pair[0], pair[1]);
        if soc <= b[0] {
            let t = (soc - a[0]) / (b[0] - a[0]);
            return a[1] + t * (b[1] - a[1]);
        }
    }
    curve.last().map_or(0.0, |p| p[1])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn model() -> BatteryModel {
        BatteryModel {
            id: "b".into(),
            cells: 2,
            capacity_ah: 0.55,
            ocv_curve: vec![[0.0, 3.3], [0.5, 3.85], [1.0, 4.35]],
            r0_ohm: 0.045,
            r1_ohm: 0.02,
            c1_f: 600.0,
            cell_full_v: 4.35,
            cell_empty_v: 3.3,
            avionics_current_a: 0.25,
        }
    }

    #[test]
    fn voltage_sags_under_thrust_and_recovers() {
        let mut b = Battery::new(&model(), 0.8);
        let rest = b.voltage_v;
        for _ in 0..2000 {
            b.step(20.0, 0.0005);
        }
        let loaded = b.voltage_v;
        assert!(rest - loaded > 0.85, "sag {}", rest - loaded);
        for _ in 0..200_000 {
            b.step(0.0, 0.0005);
        }
        assert!(b.voltage_v > loaded + 0.8);
        assert!(b.voltage_v < rest);
    }

    #[test]
    fn coulomb_counting() {
        let mut b = Battery::new(&model(), 1.0);
        for _ in 0..3600 {
            b.step(0.55, 1.0);
        }
        assert!(b.soc.abs() < 1e-9);
        assert!((b.consumed_mah - 550.0).abs() < 1e-6);
    }
}
