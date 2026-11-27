use std::collections::BTreeMap;
use std::time::Instant;

use drone_protocol::{FlightModeRequest, RcSticks};
use drone_runner::{Lab, RunOutput, Session, SessionOptions};
use drone_schema::manifest::{Environment, Initial, Scenario};
use drone_telemetry::{COLUMNS, Event, Sample};
use serde_json::{Value, json};

pub const FRAME_KIND_SAMPLE: u32 = 1;
const MANUAL_LIMIT_S: f64 = 600.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode {
    Scenario,
    Manual,
}

pub struct Live {
    pub id: u32,
    pub mode: Mode,
    pub scenario: Scenario,
    pub opts: SessionOptions,
    session: Session,
    pub speed: f64,
    pub paused: bool,
    accumulator: f64,
    sent_events: usize,
    started: Instant,
    frames: u64,
}

pub fn manual_scenario(airframe: &str) -> Scenario {
    Scenario {
        kind: "scenario".into(),
        id: "manual_flight".into(),
        name: "Manual flight".into(),
        description: "Flown live from Drone Studio with a gamepad or the keyboard.".into(),
        tags: vec!["manual".into()],
        airframe: airframe.to_owned(),
        duration_s: MANUAL_LIMIT_S,
        seed: 0,
        environment: Environment {
            altitude_asl_m: 120.0,
            temperature_c: 20.0,
            steady_wind_mps: [0.0; 3],
            turbulence: drone_sim::Turbulence::None,
            gusts: Vec::new(),
        },
        initial: Initial::default(),
        faults: Vec::new(),
        pilot: Vec::new(),
        params: BTreeMap::new(),
        assertions: Vec::new(),
    }
}

impl Live {
    pub fn new(
        lab: &Lab,
        id: u32,
        mode: Mode,
        scenario: Scenario,
        opts: SessionOptions,
        speed: f64,
    ) -> anyhow::Result<Self> {
        let model = lab.model(&scenario.airframe)?;
        let mut session = Session::new(model, Some(&scenario), &opts)?;
        if mode == Mode::Manual {
            session.rc = RcSticks {
                throttle: 0.5,
                mode: FlightModeRequest::AltHold,
                valid: true,
                ..RcSticks::default()
            };
        }
        Ok(Self {
            id,
            mode,
            scenario,
            opts,
            session,
            speed: speed.clamp(0.05, 20.0),
            paused: false,
            accumulator: 0.0,
            sent_events: 0,
            started: Instant::now(),
            frames: 0,
        })
    }

    pub fn time_s(&self) -> f64 {
        self.session.time_s()
    }

    pub fn duration_s(&self) -> f64 {
        self.scenario.duration_s
    }

    pub fn set_rc(&mut self, p: &Value) {
        let rc = &mut self.session.rc;
        let f = |k: &str, cur: f32| p[k].as_f64().map_or(cur, |v| v as f32);
        rc.roll = f("roll", rc.roll).clamp(-1.0, 1.0);
        rc.pitch = f("pitch", rc.pitch).clamp(-1.0, 1.0);
        rc.yaw = f("yaw", rc.yaw).clamp(-1.0, 1.0);
        rc.throttle = f("throttle", rc.throttle).clamp(0.0, 1.0);
        if let Some(a) = p["arm"].as_bool() {
            rc.arm = a;
        }
        match p["mode"].as_str() {
            Some("angle") => rc.mode = FlightModeRequest::Angle,
            Some("althold") => rc.mode = FlightModeRequest::AltHold,
            _ => {}
        }
        rc.valid = true;
    }

    pub fn rc(&self) -> Value {
        let rc = self.session.rc;
        json!({ "roll": rc.roll, "pitch": rc.pitch, "yaw": rc.yaw, "throttle": rc.throttle, "arm": rc.arm, "mode": if rc.mode == FlightModeRequest::AltHold { "althold" } else { "angle" } })
    }

    pub fn advance(&mut self, wall_dt: f64) -> anyhow::Result<bool> {
        if self.paused {
            return Ok(self.finished());
        }
        let control_hz = f64::from(self.session.simulator().model().rates.control_hz);
        self.accumulator += wall_dt.min(0.25) * self.speed * control_hz;
        while self.accumulator >= 1.0 && !self.finished() {
            self.session.step()?;
            self.accumulator -= 1.0;
        }
        self.frames += 1;
        Ok(self.finished())
    }

    pub fn finished(&self) -> bool {
        self.session.time_s() >= self.scenario.duration_s - 1e-9
    }

    pub fn current_sample(&self) -> Sample {
        self.session.sample(self.session.last_output())
    }

    pub fn frame(&self) -> Vec<u8> {
        let s = self.current_sample();
        let mut out = Vec::with_capacity(12 + COLUMNS.len() * 4);
        out.extend_from_slice(&FRAME_KIND_SAMPLE.to_le_bytes());
        out.extend_from_slice(&self.id.to_le_bytes());
        out.extend_from_slice(&(s.t as f32).to_le_bytes());
        for v in s.values() {
            out.extend_from_slice(&v.to_le_bytes());
        }
        out
    }

    pub fn new_events(&mut self) -> Vec<Event> {
        let all = &self.session.events;
        let fresh = all[self.sent_events.min(all.len())..].to_vec();
        self.sent_events = all.len();
        fresh
    }

    pub fn recent_samples(&self, n: usize) -> &[Sample] {
        let s = &self.session.samples;
        &s[s.len().saturating_sub(n)..]
    }

    pub fn status(&self) -> Value {
        json!({
            "session_id": self.id,
            "mode": if self.mode == Mode::Manual { "manual" } else { "scenario" },
            "scenario": self.scenario.id,
            "t": self.time_s(),
            "duration_s": self.duration_s(),
            "speed": self.speed,
            "paused": self.paused,
            "finished": self.finished(),
            "rc": self.rc(),
            "wall_s": self.started.elapsed().as_secs_f64(),
        })
    }

    pub fn finish(self) -> RunOutput {
        let mut params = self.scenario.params.clone();
        params.extend(self.opts.params.clone());
        let wall = self.started.elapsed().as_secs_f64();
        let mut scenario = self.scenario.clone();
        scenario.duration_s = self.session.time_s();
        drone_runner::finish(self.session, &scenario, params, wall)
    }
}
