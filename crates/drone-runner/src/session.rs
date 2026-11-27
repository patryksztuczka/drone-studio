use std::collections::BTreeMap;

use drone_protocol::{
    ActuatorOutput, ArmState, BaroReading, BatteryAdc, FlightModeRequest, ImuRaw, LogCode,
    LogLevel, RcSticks, SimStepInput, fault_flags, status_flags,
};
use drone_schema::manifest::{FaultKind, PilotMode, Scenario};
use drone_sim::{AirframeModel, Gust, SimConfig, Simulator, Vec3};
use drone_telemetry::{Event, Sample};
use flight_config::AirframeConstants;
use serde_json::json;
use target_sitl::{SitlError, SitlTarget};

#[derive(Debug, thiserror::Error)]
pub enum SessionError {
    #[error("unknown flight-core parameter `{0}`")]
    UnknownParam(String),
    #[error("parameter `{0}` = {1} is out of range")]
    ParamRange(String, f64),
    #[error("no firmware constants for airframe `{0}`")]
    NoFirmware(String),
    #[error("lockstep link failed: {0:?}")]
    Link(SitlError),
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct SessionOptions {
    pub seed: Option<u64>,
    pub params: BTreeMap<String, f64>,
    pub record_every_ticks: u32,
    pub battery_soc: Option<f64>,
}

#[derive(Clone, Copy, Debug)]
struct ActiveFault {
    kind: FaultKind,
    start: f64,
    end: f64,
    motor: Option<usize>,
    scale: f64,
    bias: [f64; 3],
    applied: bool,
}

pub struct Session {
    sim: Simulator,
    target: SitlTarget,
    pub rc: RcSticks,
    rc_loss: bool,
    ratio: u32,
    tick: u64,
    motors: [f64; 4],
    record_every: u32,
    pub samples: Vec<Sample>,
    pub events: Vec<Event>,
    faults: Vec<ActiveFault>,
    pilot: Vec<drone_schema::manifest::PilotKeyframe>,
    pilot_index: usize,
    prev_gust: bool,
    prev_saturated: bool,
    prev_on_ground: bool,
    was_airborne: bool,
    last_output: ActuatorOutput,
    pub seed: u64,
}

fn mode_of(m: PilotMode) -> FlightModeRequest {
    match m {
        PilotMode::Angle => FlightModeRequest::Angle,
        PilotMode::Althold => FlightModeRequest::AltHold,
    }
}

pub fn firmware_for(airframe: &str) -> Result<&'static AirframeConstants, SessionError> {
    flight_config::by_id(airframe).ok_or_else(|| SessionError::NoFirmware(airframe.to_owned()))
}

fn log_event(code: LogCode) -> &'static str {
    match code {
        LogCode::Boot => "BOOT",
        LogCode::GyroCalibrated => "GYRO_CALIBRATED",
        LogCode::Armed => "ARM",
        LogCode::Disarmed => "DISARM",
        LogCode::ArmRejected => "ARM_REJECTED",
        LogCode::FailsafeEntered => "FAILSAFE",
        LogCode::FailsafeCleared => "FAILSAFE_CLEARED",
        LogCode::Landed => "LANDED",
        LogCode::BatteryWarning => "BATTERY_WARNING",
        LogCode::BatteryCritical => "BATTERY_CRITICAL",
        LogCode::MotorSaturation => "FW_SATURATION",
        LogCode::ImuFault => "IMU_FAULT",
        LogCode::RcLost => "RC_LOST",
        LogCode::RcRestored => "RC_RESTORED",
        LogCode::ParamChanged => "PARAM_CHANGED",
        LogCode::CrashDetected => "CRASH",
    }
}

impl Session {
    pub fn new(
        model: &AirframeModel,
        scenario: Option<&Scenario>,
        opts: &SessionOptions,
    ) -> Result<Self, SessionError> {
        let fw = firmware_for(&model.id)?;
        let seed = opts.seed.or(scenario.map(|s| s.seed)).unwrap_or(0);
        let config = match scenario {
            Some(s) => SimConfig {
                seed,
                site_altitude_m: s.environment.altitude_asl_m,
                temperature_c: s.environment.temperature_c,
                initial_position_m: s.initial.position_m,
                initial_yaw_rad: s.initial.yaw_deg.to_radians(),
                battery_soc: opts.battery_soc.unwrap_or(s.initial.battery_soc),
                steady_wind_mps: s.environment.steady_wind_mps,
                turbulence: s.environment.turbulence,
                gusts: s
                    .environment
                    .gusts
                    .iter()
                    .map(|g| Gust {
                        start_s: g.t,
                        duration_s: g.duration_s,
                        ramp_s: g.ramp_s,
                        velocity_mps: g.velocity_mps,
                    })
                    .collect(),
            },
            None => SimConfig {
                seed,
                battery_soc: opts.battery_soc.unwrap_or(1.0),
                ..SimConfig::default()
            },
        };
        let mut target = SitlTarget::new(fw);
        let mut params: BTreeMap<String, f64> =
            scenario.map(|s| s.params.clone()).unwrap_or_default();
        params.extend(opts.params.clone());
        for (k, v) in &params {
            target.set_param(k, *v as f32).map_err(|e| match e {
                flight_core::ParamError::Unknown => SessionError::UnknownParam(k.clone()),
                flight_core::ParamError::OutOfRange => SessionError::ParamRange(k.clone(), *v),
            })?;
        }
        let faults = scenario
            .map(|s| {
                s.faults
                    .iter()
                    .map(|f| ActiveFault {
                        kind: f.kind,
                        start: f.t,
                        end: f.duration_s.map_or(f64::INFINITY, |d| f.t + d),
                        motor: f
                            .motor
                            .as_ref()
                            .and_then(|m| model.rotors.iter().position(|r| &r.id == m)),
                        scale: f.thrust_scale.unwrap_or(1.0),
                        bias: f.bias_dps.unwrap_or([0.0; 3]),
                        applied: false,
                    })
                    .collect()
            })
            .unwrap_or_default();
        let ratio = (model.rates.physics_hz / model.rates.control_hz).max(1);
        let mut session = Self {
            sim: Simulator::new(model, &config),
            target,
            rc: RcSticks {
                valid: true,
                ..RcSticks::default()
            },
            rc_loss: false,
            ratio,
            tick: 0,
            motors: [0.0; 4],
            record_every: opts.record_every_ticks.max(1),
            samples: Vec::with_capacity(
                scenario.map_or(0, |s| {
                    (s.duration_s * f64::from(model.rates.control_hz)) as usize
                }) / opts.record_every_ticks.max(1) as usize
                    + 2,
            ),
            events: Vec::new(),
            faults,
            pilot: scenario.map(|s| s.pilot.clone()).unwrap_or_default(),
            pilot_index: 0,
            prev_gust: false,
            prev_saturated: false,
            prev_on_ground: true,
            was_airborne: false,
            last_output: ActuatorOutput::default(),
            seed,
        };
        if !params.is_empty() {
            session
                .events
                .push(Event::new(0.0, "PARAMS", json!(params)));
        }
        Ok(session)
    }

    pub fn time_s(&self) -> f64 {
        self.sim.time_s()
    }

    pub fn simulator(&self) -> &Simulator {
        &self.sim
    }

    pub fn last_output(&self) -> &ActuatorOutput {
        &self.last_output
    }

    pub fn set_thrust_scale(&mut self, motor: usize, scale: f64) {
        self.sim.set_thrust_scale(motor, scale);
    }

    fn apply_pilot(&mut self, t: f64) {
        while let Some(k) = self.pilot.get(self.pilot_index) {
            if k.t > t + 1e-9 {
                break;
            }
            let rc = &mut self.rc;
            if let Some(v) = k.arm {
                rc.arm = v;
            }
            if let Some(m) = k.mode {
                rc.mode = mode_of(m);
            }
            if let Some(v) = k.roll {
                rc.roll = v as f32;
            }
            if let Some(v) = k.pitch {
                rc.pitch = v as f32;
            }
            if let Some(v) = k.yaw {
                rc.yaw = v as f32;
            }
            if let Some(v) = k.throttle {
                rc.throttle = v as f32;
            }
            self.pilot_index += 1;
        }
    }

    fn apply_faults(&mut self, t: f64) -> u16 {
        let mut flags = 0;
        self.rc_loss = false;
        for i in 0..self.faults.len() {
            let f = self.faults[i];
            let active = t >= f.start && t < f.end;
            if active && !f.applied {
                self.faults[i].applied = true;
                self.events.push(Event::new(
                    t,
                    "FAULT",
                    json!({ "fault": format!("{:?}", f.kind), "motor": f.motor.map(|m| m + 1), "thrust_scale": f.scale }),
                ));
                match f.kind {
                    FaultKind::MotorDegradation => {
                        if let Some(m) = f.motor {
                            self.sim.set_thrust_scale(m, f.scale);
                        }
                    }
                    FaultKind::GyroBiasStep => {
                        self.sim.set_gyro_bias_fault(Vec3::from_array(f.bias))
                    }
                    FaultKind::RcLoss => {}
                }
            }
            if !active && f.applied && t >= f.end && f.end.is_finite() {
                self.faults[i].end = f64::INFINITY;
                self.faults[i].start = f64::INFINITY;
                self.events.push(Event::new(
                    t,
                    "FAULT_CLEARED",
                    json!({ "fault": format!("{:?}", f.kind) }),
                ));
                match f.kind {
                    FaultKind::MotorDegradation => {
                        if let Some(m) = f.motor {
                            self.sim.set_thrust_scale(m, 1.0);
                        }
                    }
                    FaultKind::GyroBiasStep => self.sim.set_gyro_bias_fault(Vec3::ZERO),
                    FaultKind::RcLoss => {}
                }
            }
            if active {
                flags |= match f.kind {
                    FaultKind::MotorDegradation => fault_flags::MOTOR_DEGRADED,
                    FaultKind::RcLoss => {
                        self.rc_loss = true;
                        fault_flags::RC_LOSS
                    }
                    FaultKind::GyroBiasStep => fault_flags::GYRO_BIAS,
                };
            }
        }
        flags
    }

    pub fn step(&mut self) -> Result<&ActuatorOutput, SessionError> {
        for _ in 0..self.ratio {
            self.sim.step(self.motors);
        }
        let t = self.sim.time_s();
        self.apply_pilot(t);
        let mut faults = self.apply_faults(t);
        let gust = self.sim.gust_active();
        if gust {
            faults |= fault_flags::WIND_GUST;
        }
        if gust != self.prev_gust {
            let w = self.sim.truth().wind_mps;
            let kind = if gust { "GUST_START" } else { "GUST_END" };
            self.events
                .push(Event::new(t, kind, json!({ "wind_mps": [w.x, w.y, w.z] })));
            self.prev_gust = gust;
        }
        let sensors = self.sim.sensors();
        let input = SimStepInput {
            step: self.tick as u32,
            time_us: sensors.time_us,
            dt_us: 1_000_000 / self.sim.model().rates.control_hz,
            imu: ImuRaw {
                seq: sensors.imu.seq,
                gyro: sensors.imu.gyro_raw,
                accel: sensors.imu.accel_raw,
            },
            baro: BaroReading {
                seq: sensors.baro.seq,
                pressure_pa: sensors.baro.pressure_pa as f32,
                temperature_c: sensors.baro.temperature_c as f32,
            },
            battery: BatteryAdc {
                vbat_raw: sensors.adc.vbat_raw,
                current_raw: sensors.adc.current_raw,
            },
            rc: RcSticks {
                valid: self.rc.valid && !self.rc_loss,
                ..self.rc
            },
            faults,
        };
        let out = self.target.step(&input).map_err(SessionError::Link)?;
        self.motors = out.motors.map(f64::from);
        for log in out.logs() {
            let level = match log.level {
                LogLevel::Info => "info",
                LogLevel::Warn => "warn",
                LogLevel::Error => "error",
            };
            self.events.push(Event::new(
                log.time_us as f64 * 1e-6,
                log_event(log.code),
                json!({ "level": level, "args": log.args }),
            ));
        }
        let saturated = out.status & status_flags::MOTOR_SATURATED != 0;
        if saturated != self.prev_saturated {
            let kind = if saturated {
                "SATURATION"
            } else {
                "SATURATION_END"
            };
            self.events
                .push(Event::new(t, kind, json!({ "motors": out.motors })));
            self.prev_saturated = saturated;
        }
        let (on_ground, height) = self.sim.contact();
        if height > 0.05 {
            self.was_airborne = true;
        }
        if on_ground && !self.prev_on_ground && self.was_airborne {
            let v = self.sim.velocity();
            self.events.push(Event::new(
                t,
                "TOUCHDOWN",
                json!({ "vertical_speed_mps": v.z, "horizontal_speed_mps": v.x.hypot(v.y) }),
            ));
        }
        self.prev_on_ground = on_ground;
        if self.tick.is_multiple_of(u64::from(self.record_every)) {
            let s = self.sample(&out);
            self.samples.push(s);
        }
        self.tick += 1;
        self.last_output = out;
        Ok(&self.last_output)
    }

    pub fn sample(&self, out: &ActuatorOutput) -> Sample {
        let tr = self.sim.truth();
        let tel = self.target.telemetry();
        let sensors = self.sim.sensors();
        let deg = |v: f64| v.to_degrees() as f32;
        let degf = |v: f32| v.to_degrees();
        let rpm = |w: f64| (w * 30.0 / core::f64::consts::PI) as f32;
        let lsb_g = self.sim.model().imu.gyro_lsb_per_dps as f32;
        let lsb_a = self.sim.model().imu.accel_lsb_per_g as f32;
        Sample {
            t: tr.time_s,
            pos_n: tr.position_m.x as f32,
            pos_e: tr.position_m.y as f32,
            pos_d: tr.position_m.z as f32,
            height: tr.height_agl_m as f32,
            vel_n: tr.velocity_mps.x as f32,
            vel_e: tr.velocity_mps.y as f32,
            vel_d: tr.velocity_mps.z as f32,
            roll: deg(tr.euler_rad.x),
            pitch: deg(tr.euler_rad.y),
            yaw: deg(tr.euler_rad.z),
            rate_p: deg(tr.rates_rad_s.x),
            rate_q: deg(tr.rates_rad_s.y),
            rate_r: deg(tr.rates_rad_s.z),
            q_w: tr.attitude.w as f32,
            q_x: tr.attitude.x as f32,
            q_y: tr.attitude.y as f32,
            q_z: tr.attitude.z as f32,
            est_roll: degf(tel.euler_rad.x),
            est_pitch: degf(tel.euler_rad.y),
            est_yaw: degf(tel.euler_rad.z),
            est_alt: tel.altitude_m,
            est_vz: tel.climb_mps,
            sp_roll: degf(tel.euler_setpoint_rad.x),
            sp_pitch: degf(tel.euler_setpoint_rad.y),
            sp_yaw: degf(tel.euler_setpoint_rad.z),
            sp_q_w: tel.attitude_setpoint.w,
            sp_q_x: tel.attitude_setpoint.x,
            sp_q_y: tel.attitude_setpoint.y,
            sp_q_z: tel.attitude_setpoint.z,
            sp_rate_p: degf(tel.rate_setpoint_rad_s.x),
            sp_rate_q: degf(tel.rate_setpoint_rad_s.y),
            sp_rate_r: degf(tel.rate_setpoint_rad_s.z),
            sp_alt: tel.altitude_setpoint_m,
            sp_vz: tel.climb_setpoint_mps,
            gyro_p: degf(tel.rates_rad_s.x),
            gyro_q: degf(tel.rates_rad_s.y),
            gyro_r: degf(tel.rates_rad_s.z),
            imu_gx: f32::from(sensors.imu.gyro_raw[0]) / lsb_g,
            imu_gy: f32::from(sensors.imu.gyro_raw[1]) / lsb_g,
            imu_gz: f32::from(sensors.imu.gyro_raw[2]) / lsb_g,
            imu_ax: f32::from(sensors.imu.accel_raw[0]) / lsb_a * 9.806_65,
            imu_ay: f32::from(sensors.imu.accel_raw[1]) / lsb_a * 9.806_65,
            imu_az: f32::from(sensors.imu.accel_raw[2]) / lsb_a * 9.806_65,
            baro_pa: sensors.baro.pressure_pa as f32,
            motor_1: out.motors[0],
            motor_2: out.motors[1],
            motor_3: out.motors[2],
            motor_4: out.motors[3],
            thrust_1: tr.rotor_thrust_n[0] as f32,
            thrust_2: tr.rotor_thrust_n[1] as f32,
            thrust_3: tr.rotor_thrust_n[2] as f32,
            thrust_4: tr.rotor_thrust_n[3] as f32,
            rpm_1: rpm(tr.rotor_omega[0]),
            rpm_2: rpm(tr.rotor_omega[1]),
            rpm_3: rpm(tr.rotor_omega[2]),
            rpm_4: rpm(tr.rotor_omega[3]),
            collective: tel.collective,
            torque_x: tel.torque[0],
            torque_y: tel.torque[1],
            torque_z: tel.torque[2],
            bat_v: tr.battery_v as f32,
            bat_a: tr.battery_current_a as f32,
            bat_soc: tr.battery_soc as f32,
            bat_mah: tr.consumed_mah as f32,
            fc_bat_v: tel.battery_v_filtered,
            wind_n: tr.wind_mps.x as f32,
            wind_e: tr.wind_mps.y as f32,
            wind_d: tr.wind_mps.z as f32,
            arm_state: match out.arm_state {
                ArmState::Disarmed => 0.0,
                ArmState::Armed => 1.0,
                ArmState::Failsafe => 2.0,
            },
            status: f32::from(out.status),
            saturated: if out.status & status_flags::MOTOR_SATURATED != 0 {
                1.0
            } else {
                0.0
            },
            airborne: if tel.airborne { 1.0 } else { 0.0 },
            on_ground: if tr.on_ground { 1.0 } else { 0.0 },
        }
    }
}
