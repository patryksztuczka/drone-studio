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
