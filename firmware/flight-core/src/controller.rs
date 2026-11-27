use drone_protocol::{ActuatorOutput, ArmState, LogCode, LogLevel, LogRecord, status_flags};
use flight_config::AirframeConstants;
use flight_hal::{BaroSample, BatterySample, ImuSample, ModeSwitch, RcFrame};

use crate::ahrs::Mahony;
use crate::altitude::AltitudeEstimator;
use crate::filters::{Pt1, Pt1x3};
use crate::math::{DEG, G, Q, V3, mat_mul};
use crate::mixer::{mix, thrust_to_command};
use crate::params::Params;

const CALIBRATION_SAMPLES: u32 = 300;
const CALIBRATION_MAX_SPREAD_DPS: f32 = 3.0;
const RC_TIMEOUT_US: u64 = 300_000;
const IMU_TIMEOUT_US: u64 = 20_000;
const LOW_BATTERY_HOLD_S: f32 = 1.0;
const LANDED_HOLD_S: f32 = 0.6;
const CRASH_HOLD_S: f32 = 0.3;
const ARM_MAX_TILT_DEG: f32 = 25.0;
const BARO_TIME_CONSTANT_S: f32 = 0.8;
const LOG_QUEUE: usize = 8;
const COLLECTIVE_SLEW_PER_S: f32 = 2.5;
const ACCEL_LPF_HZ: f32 = 15.0;

#[derive(Clone, Copy, Debug, Default)]
pub struct Inputs {
    pub time_us: u64,
    pub imu: Option<ImuSample>,
    pub baro: Option<BaroSample>,
    pub battery: BatterySample,
    pub rc: Option<RcFrame>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FailsafeReason {
    RcLoss,
    LowBattery,
    ImuFault,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Telemetry {
    pub attitude: Q,
    pub attitude_setpoint: Q,
    pub euler_rad: V3,
    pub euler_setpoint_rad: V3,
    pub rates_rad_s: V3,
    pub rate_setpoint_rad_s: V3,
    pub torque: [f32; 3],
    pub collective: f32,
    pub thrust: [f32; 4],
    pub altitude_m: f32,
    pub climb_mps: f32,
    pub altitude_setpoint_m: f32,
    pub climb_setpoint_mps: f32,
    pub battery_v: f32,
    pub battery_v_filtered: f32,
    pub battery_a: f32,
    pub airborne: bool,
    pub mode_althold: bool,
}

pub struct FlightController {
    cfg: &'static AirframeConstants,
    pub params: Params,
    dt: f32,
    now_us: u64,
    arm_state: ArmState,
    failsafe: Option<FailsafeReason>,
    calibrated: bool,
    calib_count: u32,
    gyro_sum: V3,
    gyro_min: V3,
    gyro_max: V3,
    accel_sum: V3,
    baro_sum: f32,
    baro_count: u32,
    gyro_bias: V3,
    accel_trim: V3,
    gyro: V3,
    accel: V3,
    last_imu_seq: Option<u32>,
    last_imu_us: u64,
    last_baro_seq: Option<u32>,
    last_baro_us: u64,
    gyro_lpf: Pt1x3,
    dterm_lpf: Pt1x3,
    accel_lpf: Pt1x3,
    accel_f: V3,
    prev_dterm: V3,
    rate_i: V3,
    ahrs: Mahony,
    alt: AltitudeEstimator,
    alt_sp: f32,
    ground_alt: f32,
    vz_i: f32,
    airborne: bool,
    rc: RcFrame,
    rc_seen: bool,
    rc_last_us: u64,
    rc_was_valid: bool,
    prev_arm_switch: bool,
    battery_lpf: Pt1,
    low_battery_s: f32,
    warning_logged: bool,
    landed_s: f32,
    crash_s: f32,
    saturated: bool,
    logs: [LogRecord; LOG_QUEUE],
    log_len: usize,
    telemetry: Telemetry,
}

impl FlightController {
    pub fn new(cfg: &'static AirframeConstants) -> Self {
        let params = Params::defaults(cfg);
        let dt = 1.0 / cfg.control_hz as f32;
        let mut c = Self {
            cfg,
            params,
            dt,
            now_us: 0,
            arm_state: ArmState::Disarmed,
            failsafe: None,
            calibrated: false,
            calib_count: 0,
            gyro_sum: V3::ZERO,
            gyro_min: V3::ZERO,
            gyro_max: V3::ZERO,
            accel_sum: V3::ZERO,
            baro_sum: 0.0,
            baro_count: 0,
            gyro_bias: V3::ZERO,
            accel_trim: V3::ZERO,
            gyro: V3::ZERO,
            accel: V3::new(0.0, 0.0, -G),
            last_imu_seq: None,
            last_imu_us: 0,
            last_baro_seq: None,
            last_baro_us: 0,
            gyro_lpf: Pt1x3::new(params.gyro_lpf_hz, dt),
            dterm_lpf: Pt1x3::new(params.dterm_lpf_hz, dt),
            accel_lpf: Pt1x3::new(ACCEL_LPF_HZ, dt),
            accel_f: V3::new(0.0, 0.0, -G),
            prev_dterm: V3::ZERO,
            rate_i: V3::ZERO,
            ahrs: Mahony::default(),
            alt: AltitudeEstimator::default(),
            alt_sp: 0.0,
            ground_alt: 0.0,
            vz_i: 0.0,
            airborne: false,
            rc: RcFrame::default(),
            rc_seen: false,
            rc_last_us: 0,
            rc_was_valid: false,
            prev_arm_switch: false,
            battery_lpf: Pt1::new(1.0, dt),
            low_battery_s: 0.0,
            warning_logged: false,
            landed_s: 0.0,
            crash_s: 0.0,
            saturated: false,
            logs: [LogRecord::default(); LOG_QUEUE],
            log_len: 0,
            telemetry: Telemetry::default(),
        };
        c.log(
            LogLevel::Info,
            LogCode::Boot,
            [i32::from(cfg.imu_who_am_i), 0],
        );
        c
    }

    pub fn config(&self) -> &'static AirframeConstants {
        self.cfg
    }

    pub fn arm_state(&self) -> ArmState {
        self.arm_state
    }

    pub fn failsafe_reason(&self) -> Option<FailsafeReason> {
        self.failsafe
    }

    pub fn telemetry(&self) -> &Telemetry {
        &self.telemetry
    }

    pub fn is_calibrated(&self) -> bool {
        self.calibrated
    }

    pub fn apply_params(&mut self) {
        self.gyro_lpf.set_cutoff(self.params.gyro_lpf_hz, self.dt);
        self.dterm_lpf.set_cutoff(self.params.dterm_lpf_hz, self.dt);
    }

    fn log(&mut self, level: LogLevel, code: LogCode, args: [i32; 2]) {
        if self.log_len < LOG_QUEUE {
            self.logs[self.log_len] = LogRecord {
                time_us: self.now_us,
                level,
                code,
                args,
            };
            self.log_len += 1;
        }
    }

    fn convert_imu(&mut self, s: &ImuSample) {
        let gs = 1.0 / self.cfg.gyro_lsb_per_dps * DEG;
        let as_ = G / self.cfg.accel_lsb_per_g;
        let m = &self.cfg.imu_body_from_sensor;
        let gyro = mat_mul(
            m,
            V3::new(
                f32::from(s.gyro_raw[0]),
                f32::from(s.gyro_raw[1]),
                f32::from(s.gyro_raw[2]),
            ) * gs,
        );
        let accel = mat_mul(
            m,
            V3::new(
                f32::from(s.accel_raw[0]),
                f32::from(s.accel_raw[1]),
                f32::from(s.accel_raw[2]),
            ) * as_,
        );
        self.gyro = gyro - self.gyro_bias;
        self.accel = accel - self.accel_trim;
    }

    fn calibrate(&mut self, baro: Option<&BaroSample>) {
        let g = self.gyro;
        if self.calib_count == 0 {
            self.gyro_min = g;
            self.gyro_max = g;
        }
        self.gyro_min = V3::new(
            self.gyro_min.x.min(g.x),
            self.gyro_min.y.min(g.y),
            self.gyro_min.z.min(g.z),
        );
        self.gyro_max = V3::new(
            self.gyro_max.x.max(g.x),
            self.gyro_max.y.max(g.y),
            self.gyro_max.z.max(g.z),
        );
        self.gyro_sum = self.gyro_sum + g;
        self.accel_sum = self.accel_sum + self.accel;
        if let Some(b) = baro {
            self.baro_sum += b.pressure_pa;
            self.baro_count += 1;
        }
        self.calib_count += 1;
        let spread = self.gyro_max - self.gyro_min;
        if spread.x.max(spread.y).max(spread.z) > CALIBRATION_MAX_SPREAD_DPS * DEG {
            self.calib_count = 0;
            self.gyro_sum = V3::ZERO;
            self.accel_sum = V3::ZERO;
            self.baro_sum = 0.0;
            self.baro_count = 0;
            return;
        }
        if self.calib_count < CALIBRATION_SAMPLES || self.baro_count < 3 {
            return;
        }
        let n = 1.0 / self.calib_count as f32;
        self.gyro_bias = self.gyro_sum * n;
        let mean_accel = self.accel_sum * n;
        self.accel_trim = V3::new(mean_accel.x, mean_accel.y, 0.0);
        self.ahrs.align(mean_accel - self.accel_trim, 0.0);
        self.alt
            .set_reference(self.baro_sum / self.baro_count as f32);
        self.calibrated = true;
        self.log(
            LogLevel::Info,
            LogCode::GyroCalibrated,
            [
                (self.gyro_bias.norm() / DEG * 1000.0) as i32,
                self.calib_count as i32,
            ],
        );
    }

    fn rc_valid(&self) -> bool {
        self.rc_seen && self.now_us.saturating_sub(self.rc_last_us) < RC_TIMEOUT_US
    }

    fn arm_checks(&self) -> Result<(), i32> {
        if !self.calibrated {
            return Err(1);
        }
        if !self.rc_valid() {
            return Err(2);
        }
        let throttle_limit = if self.rc.mode == ModeSwitch::AltHold {
            0.6
        } else {
            0.1
        };
        if self.rc.throttle > throttle_limit {
            return Err(3);
        }
        if self.ahrs.q.tilt_cos() < libm::cosf(ARM_MAX_TILT_DEG * DEG) {
            return Err(4);
        }
        let critical = self.cfg.cell_critical_v * f32::from(self.cfg.battery_cells);
        if self.battery_lpf.state < critical {
            return Err(5);
        }
        Ok(())
    }

    fn arm(&mut self) {
        self.arm_state = ArmState::Armed;
        self.failsafe = None;
        self.airborne = false;
        self.ground_alt = self.alt.altitude_m;
        self.alt_sp = self.alt.altitude_m;
        self.vz_i = 0.0;
        self.rate_i = V3::ZERO;
        self.landed_s = 0.0;
        self.crash_s = 0.0;
        self.log(LogLevel::Info, LogCode::Armed, [0, 0]);
    }

    fn disarm(&mut self, code: LogCode) {
        if self.arm_state == ArmState::Disarmed {
            return;
        }
        self.arm_state = ArmState::Disarmed;
        self.airborne = false;
        self.log(LogLevel::Info, code, [0, 0]);
        if code != LogCode::Disarmed {
            self.log(LogLevel::Info, LogCode::Disarmed, [0, 0]);
        }
    }

    fn enter_failsafe(&mut self, reason: FailsafeReason) {
        if self.arm_state != ArmState::Armed {
            return;
        }
        self.arm_state = ArmState::Failsafe;
        self.failsafe = Some(reason);
        let code = match reason {
            FailsafeReason::RcLoss => 0,
            FailsafeReason::LowBattery => 1,
            FailsafeReason::ImuFault => 2,
        };
        self.log(LogLevel::Error, LogCode::FailsafeEntered, [code, 0]);
        if !self.airborne {
            self.disarm(LogCode::Landed);
        }
    }

    pub fn step(&mut self, input: &Inputs) -> ActuatorOutput {
        self.now_us = input.time_us;
        let dt = self.dt;

        if let Some(rc) = input.rc {
            self.rc = rc;
            self.rc_seen = true;
            self.rc_last_us = input.time_us;
        }
        let rc_valid = self.rc_valid();
        if rc_valid != self.rc_was_valid && self.rc_seen {
            let code = if rc_valid {
                LogCode::RcRestored
            } else {
                LogCode::RcLost
            };
            self.log(LogLevel::Warn, code, [0, 0]);
        }
        self.rc_was_valid = rc_valid;

        let cells = f32::from(self.cfg.battery_cells);
        let battery_v = f32::from(input.battery.vbat_raw) * self.cfg.vbat_volts_per_count;
        let battery_a = (f32::from(input.battery.current_raw) - self.cfg.current_offset_counts)
            * self.cfg.current_amps_per_count;
        let battery_f = self.battery_lpf.apply(battery_v);

        let fresh_imu = match input.imu {
            Some(s) if Some(s.seq) != self.last_imu_seq => {
                self.last_imu_seq = Some(s.seq);
                self.last_imu_us = input.time_us;
                self.convert_imu(&s);
                true
            }
            _ => false,
        };
        let fresh_baro = match input.baro {
            Some(b) if Some(b.seq) != self.last_baro_seq => {
                self.last_baro_seq = Some(b.seq);
                Some(b)
            }
            _ => None,
        };

        if !self.calibrated {
            if fresh_imu {
                self.calibrate(fresh_baro.as_ref());
            }
            self.prev_arm_switch = self.rc.arm;
            return self.output(input.time_us, [0.0; 4], battery_v, battery_f, battery_a);
        }

        let kp = if self.arm_state == ArmState::Disarmed {
            3.0
        } else {
            self.params.ahrs_kp
        };
        self.accel_f = self.accel_lpf.apply(self.accel);
        self.ahrs
            .update(self.gyro, self.accel_f, kp, self.params.ahrs_ki, dt);
        let q = self.ahrs.q;
        let accel_world = q.rotate(self.accel) + V3::new(0.0, 0.0, G);
        self.alt.predict(-accel_world.z, dt);
        if let Some(b) = fresh_baro {
            let dt_baro =
                ((input.time_us.saturating_sub(self.last_baro_us)) as f32 * 1e-6).clamp(0.005, 0.1);
            self.last_baro_us = input.time_us;
            self.alt
                .correct(b.pressure_pa, dt_baro, BARO_TIME_CONSTANT_S);
        }

        if input.time_us.saturating_sub(self.last_imu_us) > IMU_TIMEOUT_US {
            if self.arm_state == ArmState::Armed {
                self.log(LogLevel::Error, LogCode::ImuFault, [0, 0]);
            }
            self.enter_failsafe(FailsafeReason::ImuFault);
        }

        let warning = self.cfg.cell_warning_v * cells;
        let critical = self.cfg.cell_critical_v * cells;
        if battery_f < warning && !self.warning_logged && self.arm_state != ArmState::Disarmed {
            self.warning_logged = true;
            self.log(
                LogLevel::Warn,
                LogCode::BatteryWarning,
                [(battery_f * 1000.0) as i32, 0],
            );
        }
        if battery_f < critical && self.arm_state == ArmState::Armed {
            self.low_battery_s += dt;
            if self.low_battery_s >= LOW_BATTERY_HOLD_S {
                self.log(
                    LogLevel::Error,
                    LogCode::BatteryCritical,
                    [(battery_f * 1000.0) as i32, 0],
                );
                self.enter_failsafe(FailsafeReason::LowBattery);
            }
        } else {
            self.low_battery_s = 0.0;
        }

        let arm_switch = self.rc.arm && rc_valid;
        match self.arm_state {
            ArmState::Disarmed => {
                if arm_switch && !self.prev_arm_switch {
                    match self.arm_checks() {
                        Ok(()) => self.arm(),
                        Err(reason) => self.log(LogLevel::Warn, LogCode::ArmRejected, [reason, 0]),
                    }
                }
            }
            ArmState::Armed => {
                if !rc_valid {
                    self.enter_failsafe(FailsafeReason::RcLoss);
                } else if !self.rc.arm {
                    self.disarm(LogCode::Disarmed);
                }
            }
            ArmState::Failsafe => {
                if rc_valid && !self.rc.arm && self.failsafe == Some(FailsafeReason::RcLoss) {
                    self.disarm(LogCode::Disarmed);
                }
            }
        }
        self.prev_arm_switch = arm_switch;

        if self.arm_state != ArmState::Disarmed {
            if q.tilt_cos() < libm::cosf(80.0 * DEG) {
                self.crash_s += dt;
                if self.crash_s > CRASH_HOLD_S {
                    self.disarm(LogCode::CrashDetected);
                }
            } else {
                self.crash_s = 0.0;
            }
        }

        let motors = if self.arm_state == ArmState::Disarmed {
            self.rate_i = V3::ZERO;
            self.vz_i = 0.0;
            self.telemetry.collective = 0.0;
            self.telemetry.thrust = [0.0; 4];
            self.saturated = false;
            [0.0; 4]
        } else {
            self.control(q)
        };
        self.output(input.time_us, motors, battery_v, battery_f, battery_a)
    }

    fn climb_from_stick(&self) -> f32 {
        let s = self.rc.throttle - 0.5;
        let db = self.params.althold_deadband;
        if libm::fabsf(s) <= db {
            return 0.0;
        }
        let scaled = (libm::fabsf(s) - db) / (0.5 - db);
        libm::copysignf(scaled * self.cfg.max_climb_mps, s)
    }

    fn control(&mut self, q: Q) -> [f32; 4] {
        let dt = self.dt;
        let p = self.params;
        let failsafe = self.arm_state == ArmState::Failsafe;
        let euler = q.euler();
        let max_angle = p.angle_max_deg * DEG;
        let (roll_sp, pitch_sp, yaw_rate_sp, althold) = if failsafe {
            (0.0, 0.0, 0.0, true)
        } else {
            (
                self.rc.roll.clamp(-1.0, 1.0) * max_angle,
                -self.rc.pitch.clamp(-1.0, 1.0) * max_angle,
                self.rc.yaw.clamp(-1.0, 1.0) * p.yaw_max_rate_dps * DEG,
                self.rc.mode == ModeSwitch::AltHold,
            )
        };
        let tilt_cos = q.tilt_cos().max(0.5);
        let hover = p.hover_thrust;
        let alt = self.alt.altitude_m;
        let vz = self.alt.climb_mps;

        let (collective, climb_sp) = if althold {
            let climb_sp = if failsafe {
                -p.land_speed_mps
            } else {
                self.climb_from_stick()
            };
            if !self.airborne && climb_sp <= 0.0 {
                self.alt_sp = alt;
                self.vz_i = 0.0;
                (p.idle_thrust, climb_sp)
            } else {
                self.alt_sp = (self.alt_sp + climb_sp * dt).clamp(alt - 1.0, alt + 1.0);
                let vz_sp = (climb_sp + p.alt_kp * (self.alt_sp - alt))
                    .clamp(-self.cfg.max_climb_mps, self.cfg.max_climb_mps);
                let err = vz_sp - vz;
                if !(self.saturated && err > 0.0) {
                    self.vz_i = (self.vz_i + p.vel_z_ki * err * dt)
                        .clamp(-p.vel_z_i_limit, p.vel_z_i_limit);
                }
                self.telemetry.climb_setpoint_mps = vz_sp;
                ((hover + p.vel_z_kp * err + self.vz_i) / tilt_cos, climb_sp)
            }
        } else {
            let s = self.rc.throttle.clamp(0.0, 1.0);
            let t = if s < 0.5 {
                hover * s / 0.5
            } else {
                hover + (1.0 - hover) * (s - 0.5) / 0.5
            };
            self.alt_sp = alt;
            if s < 0.05 {
                (p.idle_thrust, 0.0)
            } else {
                (t / tilt_cos, 0.0)
            }
        };
        let rising_limit =
            self.telemetry.collective.max(p.idle_thrust) + COLLECTIVE_SLEW_PER_S * dt;
        let collective = collective.clamp(p.idle_thrust, 1.0).min(rising_limit);

        if !self.airborne
            && (alt > self.ground_alt + 0.15 || (collective > hover * 0.9 && vz > 0.25))
        {
            self.airborne = true;
        }
        if self.airborne {
            let descending_intent = climb_sp < 0.0 || (!althold && self.rc.throttle < 0.2);
            if descending_intent && libm::fabsf(vz) < 0.2 && collective < hover * 0.9 {
                self.landed_s += dt;
                if self.landed_s > LANDED_HOLD_S {
                    self.airborne = false;
                    self.landed_s = 0.0;
                    self.ground_alt = alt;
                    if failsafe {
                        self.disarm(LogCode::Landed);
                    } else {
                        self.log(LogLevel::Info, LogCode::Landed, [0, 0]);
                    }
                }
            } else {
                self.landed_s = 0.0;
            }
        }

        let q_sp = Q::from_euler(roll_sp, pitch_sp, euler.z);
        let mut q_err = q.conjugate().compose(q_sp);
        if q_err.w < 0.0 {
            q_err = Q {
                w: -q_err.w,
                x: -q_err.x,
                y: -q_err.y,
                z: -q_err.z,
            };
        }
        let max_rate = V3::from_array(self.cfg.max_rate_dps) * DEG;
        let rate_sp = V3::new(
            (p.angle_kp * 2.0 * q_err.x).clamp(-max_rate.x, max_rate.x),
            (p.angle_kp * 2.0 * q_err.y).clamp(-max_rate.y, max_rate.y),
            yaw_rate_sp.clamp(-max_rate.z, max_rate.z),
        );

        let gyro_f = self.gyro_lpf.apply(self.gyro);
        let d_meas = self.dterm_lpf.apply(self.gyro);
        let d_rate = (d_meas - self.prev_dterm) * (1.0 / dt);
        self.prev_dterm = d_meas;
        let err = rate_sp - gyro_f;
        let low_power = !self.airborne && collective <= p.idle_thrust + 1e-3;
        let mut torque = [0.0_f32; 3];
        let mut integ = self.rate_i.to_array();
        for axis in 0..3 {
            let e = err.get(axis);
            if low_power {
                integ[axis] = 0.0;
            } else if !(self.saturated && e * integ[axis] > 0.0) {
                integ[axis] = (integ[axis] + p.rate_ki[axis] * e * dt)
                    .clamp(-p.rate_i_limit[axis], p.rate_i_limit[axis]);
            }
            torque[axis] = p.rate_kp[axis] * e + integ[axis] - p.rate_kd[axis] * d_rate.get(axis);
        }
        self.rate_i = V3::from_array(integ);

        let mixed = mix(&self.cfg.mixer, collective, torque, p.idle_thrust);
        if mixed.saturated && !self.saturated {
            self.log(
                LogLevel::Warn,
                LogCode::MotorSaturation,
                [(collective * 1000.0) as i32, 0],
            );
        }
        self.saturated = mixed.saturated;

        self.telemetry.attitude_setpoint = q_sp;
        self.telemetry.euler_setpoint_rad = V3::new(roll_sp, pitch_sp, euler.z);
        self.telemetry.rates_rad_s = gyro_f;
        self.telemetry.rate_setpoint_rad_s = rate_sp;
        self.telemetry.torque = torque;
        self.telemetry.collective = collective;
        self.telemetry.thrust = mixed.thrust;
        self.telemetry.altitude_setpoint_m = self.alt_sp - self.ground_alt;
        if !althold {
            self.telemetry.climb_setpoint_mps = 0.0;
        }
        self.telemetry.mode_althold = althold;
        mixed.thrust.map(thrust_to_command)
    }

    fn output(
        &mut self,
        time_us: u64,
        motors: [f32; 4],
        v: f32,
        vf: f32,
        a: f32,
    ) -> ActuatorOutput {
        let q = self.ahrs.q;
        self.telemetry.attitude = q;
        self.telemetry.euler_rad = q.euler();
        if self.arm_state == ArmState::Disarmed {
            self.telemetry.attitude_setpoint = q;
            self.telemetry.euler_setpoint_rad = self.telemetry.euler_rad;
            self.telemetry.rates_rad_s = self.gyro;
            self.telemetry.altitude_setpoint_m = self.alt.altitude_m - self.ground_alt;
        }
        self.telemetry.altitude_m = self.alt.altitude_m - self.ground_alt;
        self.telemetry.climb_mps = self.alt.climb_mps;
        self.telemetry.battery_v = v;
        self.telemetry.battery_v_filtered = vf;
        self.telemetry.battery_a = a;
        self.telemetry.airborne = self.airborne;

        let cells = f32::from(self.cfg.battery_cells);
        let mut status = 0;
        let mut set = |flag: u16, on: bool| {
            if on {
                status |= flag;
            }
        };
        set(status_flags::GYRO_CALIBRATED, self.calibrated);
        set(status_flags::ALT_HOLD, self.telemetry.mode_althold);
        set(status_flags::MOTOR_SATURATED, self.saturated);
        set(
            status_flags::BATTERY_WARNING,
            vf < self.cfg.cell_warning_v * cells,
        );
        set(
            status_flags::BATTERY_CRITICAL,
            vf < self.cfg.cell_critical_v * cells,
        );
        set(status_flags::RC_LOST, self.rc_seen && !self.rc_valid());
        set(status_flags::LANDED, !self.airborne);
        set(
            status_flags::IMU_FAULT,
            self.failsafe == Some(FailsafeReason::ImuFault),
        );

        let mut out = ActuatorOutput {
            step: (time_us / 1000) as u32,
            time_us,
            motors,
            arm_state: self.arm_state,
            status,
            ..ActuatorOutput::default()
        };
        let n = self.log_len;
        let mut i = 0;
        while i < n && out.push_log(self.logs[i]) {
            i += 1;
        }
        self.logs.copy_within(i..n, 0);
        self.log_len = n - i;
        out
    }
}
