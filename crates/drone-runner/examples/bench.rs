use std::path::PathBuf;
use std::time::Instant;

use drone_runner::{Lab, Session, SessionOptions, run};

fn main() {
    let lab =
        Lab::open(&PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")).expect("test fixture");
    let s = lab.scenario("01_hover_calm").expect("test fixture");
    let m = lab.model(&s.airframe).expect("test fixture");
    for i in 0..3 {
        let out = run(m, s, &SessionOptions::default()).expect("test fixture");
        println!("run {i}: {:.0}x", out.realtime_factor());
    }
    let mut sim = drone_sim::Simulator::new(m, &drone_sim::SimConfig::default());
    let t = Instant::now();
    for _ in 0..20_000 {
        sim.step([0.5; 4]);
    }
    println!("sim only: {:.0}x", 10.0 / t.elapsed().as_secs_f64());
    let mut sess = Session::new(
        m,
        Some(s),
        &SessionOptions {
            record_every_ticks: 1_000_000,
            ..SessionOptions::default()
        },
    )
    .expect("test fixture");
    let t = Instant::now();
    for _ in 0..10_000 {
        sess.step().expect("test fixture");
    }
    println!(
        "session no-record: {:.0}x",
        10.0 / t.elapsed().as_secs_f64()
    );
}
