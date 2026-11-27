#![forbid(unsafe_code)]

pub mod assertions;
pub mod lab;
pub mod record;
pub mod session;

use std::time::Instant;

use drone_schema::manifest::Scenario;
use drone_sim::AirframeModel;
use drone_telemetry::{Event, Sample};
use rayon::prelude::*;
use serde_json::json;

pub use assertions::AssertionResult;
pub use lab::{Lab, LabError};
pub use session::{Session, SessionError, SessionOptions};

pub struct RunOutput {
    pub scenario: Scenario,
    pub model: AirframeModel,
    pub seed: u64,
    pub params: std::collections::BTreeMap<String, f64>,
    pub samples: Vec<Sample>,
    pub events: Vec<Event>,
    pub assertions: Vec<AssertionResult>,
    pub passed: bool,
    pub sim_time_s: f64,
    pub wall_time_s: f64,
    pub bytes_on_wire: u64,
}

impl RunOutput {
    pub fn realtime_factor(&self) -> f64 {
        if self.wall_time_s > 0.0 {
            self.sim_time_s / self.wall_time_s
        } else {
            f64::INFINITY
        }
    }
}

pub fn run(
    model: &AirframeModel,
    scenario: &Scenario,
    opts: &SessionOptions,
) -> Result<RunOutput, SessionError> {
    let started = Instant::now();
    let opts = SessionOptions {
        record_every_ticks: if opts.record_every_ticks == 0 {
            2
        } else {
            opts.record_every_ticks
        },
        ..opts.clone()
    };
    let mut session = Session::new(model, Some(scenario), &opts)?;
    let ticks = (scenario.duration_s * f64::from(model.rates.control_hz)).round() as u64;
    for _ in 0..ticks {
        session.step()?;
    }
    let wall = started.elapsed().as_secs_f64();
    let mut events = std::mem::take(&mut session.events);
    let samples = std::mem::take(&mut session.samples);
    let assertions = assertions::evaluate(scenario, &samples, &events);
    for r in assertions.iter().filter(|r| !r.passed) {
        events.push(Event::new(
            r.t_fail.unwrap_or(scenario.duration_s),
            "ASSERT_FAIL",
            json!({ "assertion": r.kind, "message": r.message }),
        ));
    }
    events.sort_by(|a, b| a.t.total_cmp(&b.t));
    let mut params = scenario.params.clone();
    params.extend(opts.params.clone());
    Ok(RunOutput {
        scenario: scenario.clone(),
        model: model.clone(),
        seed: session.seed,
        params,
        passed: assertions.iter().all(|r| r.passed),
        assertions,
        samples,
        events,
        sim_time_s: session.time_s(),
        wall_time_s: wall,
        bytes_on_wire: 0,
    })
}

pub type ThreadPool = rayon::ThreadPool;

pub fn thread_pool(jobs: Option<usize>) -> Result<ThreadPool, rayon::ThreadPoolBuildError> {
    let mut b = rayon::ThreadPoolBuilder::new();
    if let Some(j) = jobs {
        b = b.num_threads(j.max(1));
    }
    b.build()
}

pub fn run_suite(
    lab: &Lab,
    scenarios: &[&Scenario],
    opts: &SessionOptions,
) -> Vec<Result<RunOutput, String>> {
    scenarios
        .par_iter()
        .map(|s| {
            let model = lab.model(&s.airframe).map_err(|e| e.to_string())?;
            run(model, s, opts).map_err(|e| e.to_string())
        })
        .collect()
}
