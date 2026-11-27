macro_rules! columns {
    ($( $name:ident : $unit:literal ),* $(,)?) => {
        #[derive(Clone, Copy, Debug, Default, PartialEq)]
        pub struct Sample {
            pub t: f64,
            $(pub $name: f32,)*
        }

        pub const COLUMNS: &[(&str, &str)] = &[$((stringify!($name), $unit)),*];

        impl Sample {
            pub fn values(&self) -> [f32; COLUMNS.len()] {
                [$(self.$name),*]
            }

            pub fn get(&self, column: &str) -> Option<f32> {
                match column {
                    $(stringify!($name) => Some(self.$name),)*
                    _ => None,
                }
            }

            pub fn set(&mut self, column: &str, value: f32) -> bool {
                match column {
                    $(stringify!($name) => { self.$name = value; true })*
                    _ => false,
                }
            }
        }
    };
}

columns! {
    pos_n: "m", pos_e: "m", pos_d: "m", height: "m",
    vel_n: "m/s", vel_e: "m/s", vel_d: "m/s",
    roll: "deg", pitch: "deg", yaw: "deg",
    rate_p: "deg/s", rate_q: "deg/s", rate_r: "deg/s",
    q_w: "", q_x: "", q_y: "", q_z: "",
    est_roll: "deg", est_pitch: "deg", est_yaw: "deg",
    est_alt: "m", est_vz: "m/s",
    sp_roll: "deg", sp_pitch: "deg", sp_yaw: "deg",
    sp_q_w: "", sp_q_x: "", sp_q_y: "", sp_q_z: "",
    sp_rate_p: "deg/s", sp_rate_q: "deg/s", sp_rate_r: "deg/s",
    sp_alt: "m", sp_vz: "m/s",
    gyro_p: "deg/s", gyro_q: "deg/s", gyro_r: "deg/s",
    imu_gx: "deg/s", imu_gy: "deg/s", imu_gz: "deg/s",
    imu_ax: "m/s2", imu_ay: "m/s2", imu_az: "m/s2",
    baro_pa: "Pa",
    motor_1: "", motor_2: "", motor_3: "", motor_4: "",
    thrust_1: "N", thrust_2: "N", thrust_3: "N", thrust_4: "N",
    rpm_1: "rpm", rpm_2: "rpm", rpm_3: "rpm", rpm_4: "rpm",
    collective: "", torque_x: "", torque_y: "", torque_z: "",
    bat_v: "V", bat_a: "A", bat_soc: "", bat_mah: "mAh", fc_bat_v: "V",
    wind_n: "m/s", wind_e: "m/s", wind_d: "m/s",
    arm_state: "", status: "", saturated: "", airborne: "", on_ground: "",
}

impl Sample {
    pub fn motors(&self) -> [f32; 4] {
        [self.motor_1, self.motor_2, self.motor_3, self.motor_4]
    }

    pub fn thrusts(&self) -> [f32; 4] {
        [self.thrust_1, self.thrust_2, self.thrust_3, self.thrust_4]
    }

    pub fn armed(&self) -> bool {
        self.arm_state >= 1.0
    }

    pub fn tilt_deg(&self) -> f32 {
        let c = (1.0 - 2.0 * (self.q_x * self.q_x + self.q_y * self.q_y)).clamp(-1.0, 1.0);
        c.acos().to_degrees()
    }

    pub fn attitude_error_deg(&self) -> f32 {
        let dr = self.est_roll - self.sp_roll;
        let dp = self.est_pitch - self.sp_pitch;
        (dr * dr + dp * dp).sqrt()
    }

    pub fn horizontal_speed(&self) -> f32 {
        (self.vel_n * self.vel_n + self.vel_e * self.vel_e).sqrt()
    }
}
