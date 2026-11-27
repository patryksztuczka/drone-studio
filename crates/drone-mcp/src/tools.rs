use std::path::Path;
use std::process::Command;

use anyhow::Context;
use serde_json::{Value, json};

use drone_cli::{analyze, hardware, sim, studio};

pub enum CallError {
    UnknownTool,
    Failed(anyhow::Error),
}

impl From<anyhow::Error> for CallError {
    fn from(e: anyhow::Error) -> Self {
        Self::Failed(e)
    }
}

fn overrides_schema() -> Value {
    json!({
        "type": "object",
        "description": "flight-core parameter overrides, e.g. {\"rate.roll.kp\": 0.025, \"angle.kp\": 6}",
        "additionalProperties": { "type": "number" }
    })
}

pub fn definitions() -> Value {
    json!([
        {
            "name": "sim_run",
            "title": "Run a scenario",
            "description": "Fly one scenario in deterministic SITL (drone-sim + flight-core lockstep), record runs/<id>/ and return PASS/FAIL assertions and summary metrics.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "scenario": { "type": "string", "description": "Scenario id such as 02_step_roll_pitch" },
                    "seed": { "type": "integer", "minimum": 0 },
                    "overrides": overrides_schema(),
                    "record": { "type": "boolean", "default": true }
                },
                "required": ["scenario"]
            },
            "annotations": { "readOnlyHint": false, "destructiveHint": false, "idempotentHint": true }
        },
        {
            "name": "sim_suite",
            "title": "Run the regression suite",
            "description": "Run every scenario (or those with the given tags) in parallel across CPU cores and return per-scenario PASS/FAIL with failed assertions.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "tags": { "type": "array", "items": { "type": "string" } },
                    "overrides": overrides_schema(),
                    "record": { "type": "boolean", "default": true }
                }
            },
            "annotations": { "readOnlyHint": false, "destructiveHint": false, "idempotentHint": true }
        },
        {
            "name": "run_summary",
            "title": "Summarise a run",
            "description": "Metrics, assertions and notable events of a recorded run. run_id may be a full id, a unique prefix, a scenario id (its latest run) or `latest`.",
            "inputSchema": { "type": "object", "properties": { "run_id": { "type": "string" } }, "required": ["run_id"] },
            "annotations": { "readOnlyHint": true }
        },
        {
            "name": "run_anomalies",
            "title": "Find anomalies",
            "description": "Detect oscillations (frequency and amplitude per axis), motor saturation, voltage drops and low voltage, attitude-tracking errors, estimator divergence and hard landings, with time windows.",
            "inputSchema": { "type": "object", "properties": { "run_id": { "type": "string" } }, "required": ["run_id"] },
            "annotations": { "readOnlyHint": true }
        },
        {
            "name": "run_slice",
            "title": "Slice telemetry",
            "description": "Return a decimated time window of chosen telemetry signals (columnar) plus the events inside it.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "run_id": { "type": "string" },
                    "t_start": { "type": "number" },
                    "t_end": { "type": "number" },
                    "signals": { "type": "array", "items": { "type": "string" }, "description": "Column names, e.g. roll, sp_roll, gyro_p, motor_1, bat_v. Empty for a default set." },
                    "max_rows": { "type": "integer", "minimum": 1, "maximum": 5000, "default": 200 }
                },
                "required": ["run_id", "t_start", "t_end"]
            },
            "annotations": { "readOnlyHint": true }
        },
        {
            "name": "run_diff",
            "title": "Compare two runs",
            "description": "Compare metrics, assertion outcomes and trajectories of a baseline and a candidate run (ideal for PID or filter tuning).",
            "inputSchema": {
                "type": "object",
                "properties": { "baseline_id": { "type": "string" }, "candidate_id": { "type": "string" } },
                "required": ["baseline_id", "candidate_id"]
            },
            "annotations": { "readOnlyHint": true }
        },
        {
            "name": "runs_list",
            "title": "List runs",
            "description": "Recorded runs, newest first.",
            "inputSchema": { "type": "object", "properties": { "limit": { "type": "integer", "minimum": 1, "default": 20 } } },
            "annotations": { "readOnlyHint": true }
        },
        {
            "name": "hardware_validate",
            "title": "Validate hardware manifests",
            "description": "Validate hardware/ manifests against JSON Schema, cross-references and physics checks.",
            "inputSchema": { "type": "object", "properties": {} },
            "annotations": { "readOnlyHint": true }
        },
        {
            "name": "emu_smoke_test",
            "title": "Renode smoke test",
            "description": "Build the STM32H7 firmware .elf for ARM and boot it in Renode (Docker): checks the ICM-42688-P WHO_AM_I probe, >= 100 control-loop ticks and motor timer updates. Takes a minute or more.",
            "inputSchema": { "type": "object", "properties": { "board": { "type": "string", "default": "ref_h743_aio" } } },
            "annotations": { "readOnlyHint": true, "openWorldHint": false }
        },
        {
            "name": "studio_focus",
            "title": "Show a run in Studio",
            "description": "If Drone Studio is open, load the run in the Flight Time Machine and move the cursor to the timestamp.",
            "inputSchema": {
                "type": "object",
                "properties": { "run_id": { "type": "string" }, "timestamp": { "type": "number", "minimum": 0 } },
                "required": ["run_id"]
            },
            "annotations": { "readOnlyHint": true }
        }
    ])
}

fn arg_str<'a>(args: &'a Value, key: &str) -> anyhow::Result<&'a str> {
    args[key]
        .as_str()
        .with_context(|| format!("`{key}` is required and must be a string"))
}

fn overrides(args: &Value) -> anyhow::Result<Vec<String>> {
    let Some(map) = args.get("overrides").and_then(Value::as_object) else {
        return Ok(Vec::new());
    };
    map.iter()
        .map(|(k, v)| {
            v.as_f64()
                .map(|n| format!("{k}={n}"))
                .with_context(|| format!("override `{k}` must be a number"))
        })
        .collect()
}

fn compact_suite(v: Value) -> Value {
    let runs: Vec<Value> = v["runs"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|r| {
            let failed: Vec<&Value> = r["assertions"]
                .as_array()
                .into_iter()
                .flatten()
                .filter(|a| a["passed"].as_bool() != Some(true))
                .collect();
            json!({
                "scenario": r["scenario"],
                "result": r["result"],
                "run_id": r["run_id"],
                "failed_assertions": failed,
                "error": r.get("error"),
                "attitude_error_rms_deg": r["metrics"]["attitude_error_rms_deg"],
                "max_tilt_deg": r["metrics"]["max_tilt_deg"],
                "saturation_pct": r["metrics"]["saturation_pct"],
                "realtime_factor": r["realtime_factor"],
            })
        })
        .collect();
    json!({ "ok": v["ok"], "passed": v["passed"], "failed": v["failed"], "wall_time_s": v["wall_time_s"], "runs": runs })
}

fn drone_binary() -> Option<std::path::PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let candidate = exe.with_file_name(if cfg!(windows) { "drone.exe" } else { "drone" });
    candidate.is_file().then_some(candidate)
}

fn emu_smoke(root: &Path) -> anyhow::Result<Value> {
    let output = match drone_binary() {
        Some(bin) => Command::new(bin)
            .args(["--json", "emu", "smoke"])
            .current_dir(root)
            .output(),
        None => Command::new("cargo")
            .args([
                "run",
                "-q",
                "--release",
                "-p",
                "drone-cli",
                "--",
                "--json",
                "emu",
                "smoke",
            ])
            .current_dir(root)
            .output(),
    }
    .context("cannot start `drone emu smoke`")?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(stdout.trim()).with_context(|| {
        format!(
            "`drone emu smoke` did not return JSON: {}",
            String::from_utf8_lossy(&output.stderr)
                .lines()
                .last()
                .unwrap_or("")
        )
    })
}

pub fn call(root: &Path, name: &str, args: &Value) -> Result<Value, CallError> {
    let record = args["record"].as_bool().unwrap_or(true);
    let v = match name {
        "sim_run" => {
            let lab = drone_runner_lab(root)?;
            let scenario = arg_str(args, "scenario")?;
            let s = lab.scenario(scenario).map_err(anyhow::Error::from)?;
            let model = lab.model(&s.airframe).map_err(anyhow::Error::from)?;
            let opts = drone_runner::SessionOptions {
                seed: args["seed"].as_u64(),
                params: sim::parse_overrides(&overrides(args)?)?,
                ..drone_runner::SessionOptions::default()
            };
            let out = drone_runner::run(model, s, &opts).map_err(anyhow::Error::from)?;
            let rec = if record {
                let file = lab.scenario_file(&s.id).unwrap_or_default();
                Some(
                    drone_runner::record::record(root, &lab.runs_dir(), "mcp", &out, &file)
                        .map_err(anyhow::Error::from)?,
                )
            } else {
                None
            };
            sim::run_report(&out, rec.as_ref())
        }
        "sim_suite" => {
            let tags: Vec<String> = args["tags"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|t| t.as_str().map(str::to_owned))
                .collect();
            compact_suite(sim::suite_report(
                root,
                &tags,
                None,
                &overrides(args)?,
                record,
            )?)
        }
        "run_summary" => analyze::summary_report(root, arg_str(args, "run_id")?)?,
        "run_anomalies" => analyze::anomalies_report(root, arg_str(args, "run_id")?)?,
        "run_slice" => {
            let t0 = args["t_start"].as_f64().context("`t_start` is required")?;
            let t1 = args["t_end"].as_f64().context("`t_end` is required")?;
            let signals: Vec<String> = args["signals"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|t| t.as_str().map(str::to_owned))
                .collect();
            let max_rows = args["max_rows"].as_u64().unwrap_or(200).clamp(1, 5000) as usize;
            analyze::slice_report(root, arg_str(args, "run_id")?, (t0, t1), &signals, max_rows)?
        }
        "run_diff" => analyze::diff_report(
            root,
            arg_str(args, "baseline_id")?,
            arg_str(args, "candidate_id")?,
        )?,
        "runs_list" => analyze::runs_report(root, args["limit"].as_u64().unwrap_or(20) as usize),
        "hardware_validate" => hardware::validate_report(root),
        "emu_smoke_test" => emu_smoke(root)?,
        "studio_focus" => {
            let run = arg_str(args, "run_id")?;
            let dir = drone_telemetry_resolve(root, run)?;
            let result = studio::request(
                root,
                "studio.focus",
                json!({ "run_id": dir, "t": args["timestamp"].as_f64() }),
            )?;
            json!({ "focused": true, "run_id": dir, "timestamp": args["timestamp"], "studio": result })
        }
        _ => return Err(CallError::UnknownTool),
    };
    Ok(v)
}

fn drone_runner_lab(root: &Path) -> anyhow::Result<drone_runner::Lab> {
    Ok(drone_runner::Lab::open(root)?)
}

fn drone_telemetry_resolve(root: &Path, run: &str) -> anyhow::Result<String> {
    let dir = drone_telemetry::store::resolve_run(&root.join("runs"), run)?;
    Ok(drone_telemetry::store::read_meta(&dir)?.run_id)
}
