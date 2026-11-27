use std::collections::BTreeMap;
use std::path::Path;
use std::process::ExitCode;
use std::time::Instant;

use anyhow::{Context, bail};
use drone_runner::{Lab, RunOutput, SessionOptions};
use serde_json::{Value, json};

use crate::output::print_json;

pub fn parse_overrides(sets: &[String]) -> anyhow::Result<BTreeMap<String, f64>> {
    let mut out = BTreeMap::new();
    for s in sets {
        let (k, v) = s
            .split_once('=')
            .with_context(|| format!("--set expects name=value, got `{s}`"))?;
        let v: f64 = v
            .trim()
            .parse()
            .with_context(|| format!("`{v}` is not a number"))?;
        out.insert(k.trim().to_owned(), v);
    }
    Ok(out)
}

pub fn run_report(out: &RunOutput, recorded: Option<&drone_runner::record::Recorded>) -> Value {
    let metrics = recorded.map_or_else(
        || {
            serde_json::to_value(drone_telemetry::analysis::summary(
                &out.samples,
                &out.events,
            ))
            .unwrap_or_default()
        },
        |r| serde_json::to_value(&r.meta.metrics).unwrap_or_default(),
    );
    json!({
        "scenario": out.scenario.id,
        "result": if out.passed { "PASS" } else { "FAIL" },
        "run_id": recorded.map(|r| r.meta.run_id.clone()),
        "run_dir": recorded.map(|r| r.dir.to_string_lossy().into_owned()),
        "seed": out.seed,
        "params": out.params,
        "assertions": out.assertions,
        "metrics": metrics,
        "sim_time_s": (out.sim_time_s * 1000.0).round() / 1000.0,
        "wall_time_s": (out.wall_time_s * 10000.0).round() / 10000.0,
        "realtime_factor": out.realtime_factor().round(),
    })
}

fn print_run_human(v: &Value) {
    println!(
        "{} {}  run {}  ({}x real time)",
        v["result"].as_str().unwrap_or("?"),
        v["scenario"].as_str().unwrap_or("?"),
        v["run_id"].as_str().unwrap_or("not recorded"),
        v["realtime_factor"]
    );
    for a in v["assertions"].as_array().into_iter().flatten() {
        let mark = if a["passed"].as_bool() == Some(true) {
            "  ok  "
        } else {
            "  FAIL"
        };
        println!(
            "{mark} {:<26} {}",
            a["kind"].as_str().unwrap_or(""),
            a["message"].as_str().unwrap_or("")
        );
    }
}

pub fn run(
    root: &Path,
    json: bool,
    scenario: &str,
    seed: Option<u64>,
    sets: &[String],
    record: bool,
) -> anyhow::Result<ExitCode> {
    let lab = Lab::open(root)?;
    let s = lab.scenario(scenario)?;
    let model = lab.model(&s.airframe)?;
    let opts = SessionOptions {
        seed,
        params: parse_overrides(sets)?,
        ..SessionOptions::default()
    };
    let out = drone_runner::run(model, s, &opts)?;
    let rec = if record {
        let file = lab.scenario_file(&s.id).unwrap_or_default();
        Some(drone_runner::record::record(
            root,
            &lab.runs_dir(),
            "cli",
            &out,
            &file,
        )?)
    } else {
        None
    };
    let v = run_report(&out, rec.as_ref());
    if json {
        print_json(&v);
    } else {
        print_run_human(&v);
    }
    Ok(if out.passed {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    })
}

pub fn suite_report(
    root: &Path,
    tags: &[String],
    jobs: Option<usize>,
    sets: &[String],
    record: bool,
) -> anyhow::Result<Value> {
    let started = Instant::now();
    let lab = Lab::open(root)?;
    let scenarios: Vec<_> = lab
        .scenarios()
        .filter(|s| tags.is_empty() || tags.iter().any(|t| s.tags.contains(t)))
        .collect();
    if scenarios.is_empty() {
        bail!("no scenario matches tags {tags:?}");
    }
    let opts = SessionOptions {
        params: parse_overrides(sets)?,
        ..SessionOptions::default()
    };
    let pool = rayon_pool(jobs)?;
    let results = pool.install(|| drone_runner::run_suite(&lab, &scenarios, &opts));
    let mut runs = Vec::new();
    let mut passed = 0;
    let mut failed = 0;
    for (s, r) in scenarios.iter().zip(results) {
        match r {
            Ok(out) => {
                let rec = if record {
                    let file = lab.scenario_file(&s.id).unwrap_or_default();
                    Some(drone_runner::record::record(
                        root,
                        &lab.runs_dir(),
                        "suite",
                        &out,
                        &file,
                    )?)
                } else {
                    None
                };
                if out.passed {
                    passed += 1;
                } else {
                    failed += 1;
                }
                runs.push(run_report(&out, rec.as_ref()));
            }
            Err(e) => {
                failed += 1;
                runs.push(json!({ "scenario": s.id, "result": "ERROR", "error": e }));
            }
        }
    }
    Ok(json!({
        "ok": failed == 0,
        "passed": passed,
        "failed": failed,
        "scenarios": runs.len(),
        "wall_time_s": (started.elapsed().as_secs_f64() * 1000.0).round() / 1000.0,
        "runs": runs,
    }))
}

fn rayon_pool(jobs: Option<usize>) -> anyhow::Result<drone_runner::ThreadPool> {
    drone_runner::thread_pool(jobs).context("cannot start worker threads")
}

pub fn suite(
    root: &Path,
    json: bool,
    tags: &[String],
    jobs: Option<usize>,
    sets: &[String],
    record: bool,
) -> anyhow::Result<ExitCode> {
    let v = suite_report(root, tags, jobs, sets, record)?;
    if json {
        print_json(&v);
    } else {
        for r in v["runs"].as_array().into_iter().flatten() {
            print_run_human(r);
        }
        println!(
            "\n{} passed, {} failed in {:.2} s",
            v["passed"],
            v["failed"],
            v["wall_time_s"].as_f64().unwrap_or(0.0)
        );
    }
    Ok(if v["ok"].as_bool() == Some(true) {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    })
}
