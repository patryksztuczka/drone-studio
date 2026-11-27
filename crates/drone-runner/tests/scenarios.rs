use std::path::PathBuf;

use drone_runner::{Lab, SessionOptions, run};

fn lab() -> Lab {
    Lab::open(&PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")).expect("test fixture")
}

#[test]
fn every_baseline_scenario_passes() {
    let lab = lab();
    let scenarios: Vec<_> = lab.scenarios().collect();
    assert_eq!(scenarios.len(), 5);
    let results = drone_runner::run_suite(&lab, &scenarios, &SessionOptions::default());
    for r in results {
        let out = r.expect("test fixture");
        let failed: Vec<_> = out
            .assertions
            .iter()
            .filter(|a| !a.passed)
            .map(|a| &a.message)
            .collect();
        assert!(out.passed, "{} failed: {failed:?}", out.scenario.id);
    }
}

#[test]
fn same_seed_reproduces_the_flight_exactly() {
    let lab = lab();
    let s = lab.scenario("03_wind_gust_6ms").expect("test fixture");
    let model = lab.model(&s.airframe).expect("test fixture");
    let a = run(model, s, &SessionOptions::default()).expect("test fixture");
    let b = run(model, s, &SessionOptions::default()).expect("test fixture");
    assert_eq!(a.samples, b.samples);
    assert_eq!(a.events, b.events);
    let c = run(
        model,
        s,
        &SessionOptions {
            seed: Some(99),
            ..SessionOptions::default()
        },
    )
    .expect("test fixture");
    assert_ne!(a.samples, c.samples);
}

#[test]
fn parameter_overrides_change_the_flight() {
    let lab = lab();
    let s = lab.scenario("02_step_roll_pitch").expect("test fixture");
    let model = lab.model(&s.airframe).expect("test fixture");
    let mut opts = SessionOptions::default();
    opts.params.insert("angle.kp".into(), 2.0);
    let slow = run(model, s, &opts).expect("test fixture");
    let step = slow
        .assertions
        .iter()
        .find(|a| a.kind == drone_schema::manifest::AssertionKind::StepResponse)
        .expect("test fixture");
    assert!(
        !slow.passed,
        "a sluggish angle loop should miss the rise-time limit: {}",
        step.message
    );
    opts.params.insert("angle.kp".into(), 500.0);
    assert!(run(model, s, &opts).is_err());
}

#[test]
fn recorded_runs_round_trip_and_flag_injected_oscillation() {
    let lab = lab();
    let runs = std::env::temp_dir().join(format!("drone-runner-runs-{}", std::process::id()));
    let s = lab.scenario("01_hover_calm").expect("scenario");
    let model = lab.model(&s.airframe).expect("model");
    let calm = run(model, s, &SessionOptions::default()).expect("run");
    let rec = drone_runner::record::record(
        &lab.root,
        &runs,
        "test",
        &calm,
        "hardware/scenarios/01_hover_calm.yaml",
    )
    .expect("record");
    let loaded = drone_telemetry::store::load_run(&rec.dir).expect("load");
    assert_eq!(loaded.samples, calm.samples);
    assert_eq!(loaded.meta.result, "PASS");
    let quiet = drone_telemetry::analysis::anomalies(
        &loaded.samples,
        &loaded.events,
        &drone_telemetry::Thresholds::default(),
    );
    assert!(
        quiet
            .iter()
            .all(|a| a.kind != drone_telemetry::AnomalyKind::Oscillation),
        "{quiet:#?}"
    );

    let mut opts = SessionOptions::default();
    opts.params.insert("rate.roll.kp".into(), 0.2);
    opts.params.insert("rate.roll.kd".into(), 0.0);
    let shaky = run(model, s, &opts).expect("run");
    let found = drone_telemetry::analysis::anomalies(
        &shaky.samples,
        &shaky.events,
        &drone_telemetry::Thresholds::default(),
    );
    assert!(
        found
            .iter()
            .any(|a| a.kind == drone_telemetry::AnomalyKind::Oscillation && a.channel == "gyro_p"),
        "{found:#?}"
    );
    let _ = std::fs::remove_dir_all(&runs);
}
