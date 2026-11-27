pub const G0: f64 = 9.806_65;
const R_AIR: f64 = 287.052_87;
const LAPSE: f64 = 0.006_5;
const P0: f64 = 101_325.0;
const EXPONENT: f64 = G0 / (R_AIR * LAPSE);

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Atmosphere {
    sea_level_temperature_k: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AirState {
    pub pressure_pa: f64,
    pub temperature_k: f64,
    pub density_kg_m3: f64,
}

impl Atmosphere {
    pub fn new(site_altitude_m: f64, site_temperature_c: f64) -> Self {
        Self {
            sea_level_temperature_k: site_temperature_c + 273.15 + LAPSE * site_altitude_m,
        }
    }

    pub fn at(&self, altitude_asl_m: f64) -> AirState {
        let t = self.sea_level_temperature_k - LAPSE * altitude_asl_m;
        let p = P0 * libm::pow(t / self.sea_level_temperature_k, EXPONENT);
        AirState {
            pressure_pa: p,
            temperature_k: t,
            density_kg_m3: p / (R_AIR * t),
        }
    }
}

pub fn pressure_altitude_m(pressure_pa: f64, reference_pa: f64) -> f64 {
    44_330.0 * (1.0 - libm::pow(pressure_pa / reference_pa, 1.0 / 5.255))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn standard_sea_level() {
        let a = Atmosphere::new(0.0, 15.0).at(0.0);
        assert!((a.pressure_pa - 101_325.0).abs() < 1e-6);
        assert!((a.density_kg_m3 - 1.225).abs() < 1e-3);
    }

    #[test]
    fn pressure_drops_about_12_pa_per_metre() {
        let atm = Atmosphere::new(100.0, 20.0);
        let dp = atm.at(100.0).pressure_pa - atm.at(101.0).pressure_pa;
        assert!(dp > 11.0 && dp < 13.0, "{dp}");
    }
}
