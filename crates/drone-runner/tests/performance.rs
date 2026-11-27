use std::path::PathBuf;

use drone_runner::{Lab, SessionOptions, run};

fn lab() -> Lab {
    Lab::open(&PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")).expect("test fixture")
}

#[test]
fn sitl_runs_faster_than_500x_real_time() {
    let lab = lab();
    let s = lab.scenario("01_hover_calm").expect("test fixture");
    let out = run(
        lab.model(&s.airframe).expect("test fixture"),
        s,
        &SessionOptions::default(),
    )
    .expect("test fixture");
    let required = if cfg!(debug_assertions) { 20.0 } else { 500.0 };
    assert!(
        out.realtime_factor() > required,
        "{:.0}x",
        out.realtime_factor()
    );
}
