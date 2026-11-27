use std::path::Path;

use anyhow::{Context, bail};
use drone_telemetry::analysis::{self, Thresholds};
use drone_telemetry::store;
use serde_json::{Value, json};

use crate::output::print_json;

pub fn parse_range(s: &str) -> anyhow::Result<(f64, f64)> {
    let (a, b) = s
        .split_once("..")
        .context("--slice expects t0..t1, for example 4.5..6")?;
    let a: f64 = if a.is_empty() {
        0.0
    } else {
        a.parse().context("bad t0")?
    };
    let b: f64 = if b.is_empty() {
        f64::INFINITY
    } else {
        b.parse().context("bad t1")?
    };
    if b <= a {
        bail!("t1 must be greater than t0");
    }
    Ok((a, b))
}

pub fn load(root: &Path, run: &str) -> anyhow::Result<store::LoadedRun> {
    let dir = store::resolve_run(&root.join("runs"), run)?;
    Ok(store::load_run(&dir)?)
}

pub fn summary_report(root: &Path, run: &str) -> anyhow::Result<Value> {
    let r = load(root, run)?;
    let notable: Vec<&drone_telemetry::Event> = r
        .events
        .iter()
        .filter(|e| {
            !matches!(
                e.kind.as_str(),
                "SATURATION_END" | "FW_SATURATION" | "BOOT" | "RC_RESTORED"
            )
        })
        .take(60)
        .collect();
    Ok(json!({
        "run_id": r.meta.run_id,
        "scenario": r.meta.scenario.id,
        "result": r.meta.result,
        "seed": r.meta.seed,
        "params": r.meta.params,
        "git": r.meta.git,
        "airframe": r.meta.airframe,
        "metrics": r.meta.metrics,
        "assertions": r.meta.assertions,
        "events": notable,
        "samples": r.meta.samples,
        "sample_rate_hz": r.meta.sample_rate_hz,
    }))
}

pub fn anomalies_report(root: &Path, run: &str) -> anyhow::Result<Value> {
    let r = load(root, run)?;
    let found = analysis::anomalies(&r.samples, &r.events, &Thresholds::default());
    Ok(
        json!({ "run_id": r.meta.run_id, "result": r.meta.result, "count": found.len(), "anomalies": found }),
    )
}

pub fn slice_report(
    root: &Path,
    run: &str,
    range: (f64, f64),
    signals: &[String],
    max_rows: usize,
) -> anyhow::Result<Value> {
    let r = load(root, run)?;
    let s = analysis::slice(&r.samples, range.0, range.1, signals, max_rows)
        .map_err(anyhow::Error::msg)?;
    let events: Vec<_> = r
        .events
        .iter()
        .filter(|e| e.t >= range.0 && e.t <= range.1)
        .collect();
    Ok(json!({ "run_id": r.meta.run_id, "slice": s, "events": events }))
}

pub fn diff_report(root: &Path, baseline: &str, candidate: &str) -> anyhow::Result<Value> {
    let a = load(root, baseline)?;
    let b = load(root, candidate)?;
    let d = analysis::diff((&a.meta.metrics, &a.samples), (&b.meta.metrics, &b.samples));
    let outcome = |m: &store::RunMeta| -> Vec<(String, bool)> {
        m.assertions
            .iter()
            .map(|x| {
                (
                    x["kind"].as_str().unwrap_or("").to_owned(),
                    x["passed"].as_bool().unwrap_or(false),
                )
            })
            .collect()
    };
    let (oa, ob) = (outcome(&a.meta), outcome(&b.meta));
    let changes: Vec<Value> = oa
        .iter()
        .zip(ob.iter())
        .filter(|(x, y)| x.1 != y.1)
        .map(|(x, y)| json!({ "assertion": x.0, "baseline": x.1, "candidate": y.1 }))
        .collect();
    Ok(json!({
        "baseline": { "run_id": a.meta.run_id, "scenario": a.meta.scenario.id, "result": a.meta.result, "params": a.meta.params, "seed": a.meta.seed },
        "candidate": { "run_id": b.meta.run_id, "scenario": b.meta.scenario.id, "result": b.meta.result, "params": b.meta.params, "seed": b.meta.seed },
        "same_scenario": a.meta.scenario.id == b.meta.scenario.id,
        "verdict": d.verdict,
        "improved": d.improved,
        "regressed": d.regressed,
        "assertion_changes": changes,
        "metrics": d.metrics,
        "tracks": d.tracks,
    }))
}

pub fn runs_report(root: &Path, limit: usize) -> Value {
    let runs: Vec<Value> = store::list_runs(&root.join("runs"))
        .into_iter()
        .take(limit)
        .map(|(_, m)| {
            json!({
                "run_id": m.run_id,
                "created_at": m.created_at,
                "scenario": m.scenario.id,
                "result": m.result,
                "source": m.source,
                "seed": m.seed,
                "params": m.params,
                "attitude_error_rms_deg": m.metrics.attitude_error_rms_deg,
                "max_tilt_deg": m.metrics.max_tilt_deg,
            })
        })
        .collect();
    json!({ "count": runs.len(), "runs": runs })
}

pub fn print(json_out: bool, v: &Value) {
    if json_out {
        print_json(v);
    } else {
        match serde_json::to_string_pretty(v) {
            Ok(s) => println!("{s}"),
            Err(e) => eprintln!("{e}"),
        }
    }
}
