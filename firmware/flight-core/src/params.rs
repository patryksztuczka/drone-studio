use flight_config::AirframeConstants;

macro_rules! params {
    ($( $id:literal => $name:literal, $field:ident $([$idx:literal])?, $min:literal, $max:literal; )*) => {
        pub const PARAM_NAMES: &[&str] = &[$($name),*];
        pub const PARAM_RANGES: &[(f32, f32)] = &[$(($min, $max)),*];

        impl Params {
            pub fn get(&self, id: u16) -> Option<f32> {
                match id {
                    $($id => Some(self.$field $([$idx])?),)*
                    _ => None,
                }
            }

            pub fn set(&mut self, id: u16, value: f32) -> Result<(), ParamError> {
                let (min, max) = *PARAM_RANGES.get(usize::from(id)).ok_or(ParamError::Unknown)?;
                if !(value >= min && value <= max) {
                    return Err(ParamError::OutOfRange);
                }
                match id {
                    $($id => self.$field $([$idx])? = value,)*
                    _ => return Err(ParamError::Unknown),
                }
                Ok(())
            }
        }
    };
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ParamError {
    Unknown,
    OutOfRange,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Params {
    pub rate_kp: [f32; 3],
    pub rate_ki: [f32; 3],
    pub rate_kd: [f32; 3],
    pub rate_i_limit: [f32; 3],
    pub angle_kp: f32,
    pub angle_max_deg: f32,
    pub yaw_max_rate_dps: f32,
    pub alt_kp: f32,
    pub vel_z_kp: f32,
    pub vel_z_ki: f32,
    pub vel_z_i_limit: f32,
    pub gyro_lpf_hz: f32,
    pub dterm_lpf_hz: f32,
    pub ahrs_kp: f32,
    pub ahrs_ki: f32,
    pub hover_thrust: f32,
    pub idle_thrust: f32,
    pub althold_deadband: f32,
    pub land_speed_mps: f32,
}

params! {
    0 => "rate.roll.kp", rate_kp[0], 0.0, 0.2;
    1 => "rate.pitch.kp", rate_kp[1], 0.0, 0.2;
    2 => "rate.yaw.kp", rate_kp[2], 0.0, 1.0;
    3 => "rate.roll.ki", rate_ki[0], 0.0, 2.0;
    4 => "rate.pitch.ki", rate_ki[1], 0.0, 2.0;
    5 => "rate.yaw.ki", rate_ki[2], 0.0, 5.0;
    6 => "rate.roll.kd", rate_kd[0], 0.0, 0.01;
    7 => "rate.pitch.kd", rate_kd[1], 0.0, 0.01;
    8 => "rate.yaw.kd", rate_kd[2], 0.0, 0.05;
    9 => "rate.roll.i_limit", rate_i_limit[0], 0.0, 0.5;
    10 => "rate.pitch.i_limit", rate_i_limit[1], 0.0, 0.5;
    11 => "rate.yaw.i_limit", rate_i_limit[2], 0.0, 0.5;
    12 => "angle.kp", angle_kp, 0.0, 30.0;
    13 => "angle.max_deg", angle_max_deg, 5.0, 60.0;
    14 => "yaw.max_rate_dps", yaw_max_rate_dps, 10.0, 600.0;
    15 => "alt.kp", alt_kp, 0.0, 10.0;
    16 => "vel_z.kp", vel_z_kp, 0.0, 2.0;
    17 => "vel_z.ki", vel_z_ki, 0.0, 5.0;
    18 => "vel_z.i_limit", vel_z_i_limit, 0.0, 0.5;
    19 => "gyro.lpf_hz", gyro_lpf_hz, 10.0, 500.0;
    20 => "dterm.lpf_hz", dterm_lpf_hz, 10.0, 500.0;
    21 => "ahrs.kp", ahrs_kp, 0.0, 10.0;
    22 => "ahrs.ki", ahrs_ki, 0.0, 1.0;
    23 => "hover.thrust", hover_thrust, 0.05, 0.8;
    24 => "hover.idle_thrust", idle_thrust, 0.0, 0.2;
    25 => "alt.deadband", althold_deadband, 0.0, 0.3;
    26 => "alt.land_speed_mps", land_speed_mps, 0.1, 2.0;
}

impl Params {
    pub fn defaults(airframe: &AirframeConstants) -> Self {
        Self {
            rate_kp: [0.020, 0.020, 0.10],
            rate_ki: [0.20, 0.20, 0.50],
            rate_kd: [0.0005, 0.0005, 0.0],
            rate_i_limit: [0.15, 0.15, 0.15],
            angle_kp: 7.0,
            angle_max_deg: 30.0,
            yaw_max_rate_dps: 180.0,
            alt_kp: 1.5,
            vel_z_kp: 0.15,
            vel_z_ki: 0.20,
            vel_z_i_limit: 0.15,
            gyro_lpf_hz: 90.0,
            dterm_lpf_hz: 60.0,
            ahrs_kp: 0.1,
            ahrs_ki: 0.01,
            hover_thrust: airframe.hover_thrust_fraction,
            idle_thrust: 0.02,
            althold_deadband: 0.1,
            land_speed_mps: 0.5,
        }
    }

    pub fn id_of(name: &str) -> Option<u16> {
        PARAM_NAMES
            .iter()
            .position(|n| *n == name)
            .map(|i| i as u16)
    }

    pub fn set_by_name(&mut self, name: &str, value: f32) -> Result<(), ParamError> {
        self.set(Self::id_of(name).ok_or(ParamError::Unknown)?, value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn table_is_consistent() {
        let mut p = Params::defaults(flight_config::DEFAULT);
        assert_eq!(PARAM_NAMES.len(), PARAM_RANGES.len());
        for (i, name) in PARAM_NAMES.iter().enumerate() {
            let id = i as u16;
            assert_eq!(Params::id_of(name), Some(id));
            let v = p.get(id).unwrap();
            let (min, max) = PARAM_RANGES[i];
            assert!(
                v >= min && v <= max,
                "{name} default {v} outside [{min}, {max}]"
            );
            p.set(id, v).unwrap();
        }
        assert_eq!(
            p.set_by_name("rate.roll.kp", 5.0),
            Err(ParamError::OutOfRange)
        );
        assert_eq!(
            p.set_by_name("rate.roll.kp", f32::NAN),
            Err(ParamError::OutOfRange)
        );
        assert_eq!(p.set_by_name("nope", 1.0), Err(ParamError::Unknown));
        p.set_by_name("rate.pitch.kd", 0.001).unwrap();
        assert_eq!(p.rate_kd[1], 0.001);
    }
}
