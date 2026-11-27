use std::path::PathBuf;
use std::process::Command;

use anyhow::{Context, bail};
use drone_runner::{Lab, SessionOptions};
use drone_telemetry::{COLUMNS, Sample, store};
use serde_json::{Value, json};
use tokio::sync::broadcast;

use crate::live::{Live, Mode, manual_scenario};
use crate::{Outgoing, hardware, notification, spectrum};

pub struct Engine {
    root: PathBuf,
    url: String,
    lab: Lab,
    live: Option<Live>,
    next_id: u32,
    frames: u64,
}

fn columns() -> Vec<&'static str> {
    std::iter::once("t")
        .chain(COLUMNS.iter().map(|c| c.0))
        .collect()
}

fn overrides(p: &Value) -> anyhow::Result<std::collections::BTreeMap<String, f64>> {
    let mut out = std::collections::BTreeMap::new();
    if let Some(m) = p["overrides"].as_object() {
        for (k, v) in m {
            out.insert(
                k.clone(),
                v.as_f64()
                    .with_context(|| format!("override `{k}` must be a number"))?,
            );
        }
    }
    Ok(out)
}

fn decimated(samples: &[Sample], rate_hz: f64) -> (Vec<f64>, serde_json::Map<String, Value>) {
    let dt = match samples {
        [a, b, ..] => b.t - a.t,
        _ => 1.0,
    };
    let step = ((1.0 / rate_hz) / dt).round().max(1.0) as usize;
    let picked: Vec<&Sample> = samples.iter().step_by(step).collect();
    let t = picked
        .iter()
        .map(|s| (s.t * 1000.0).round() / 1000.0)
        .collect();
    let mut cols = serde_json::Map::new();
    for (name, _) in COLUMNS {
        cols.insert(
            (*name).to_owned(),
            json!(
                picked
                    .iter()
                    .map(|s| s.get(name).unwrap_or(0.0))
                    .collect::<Vec<f32>>()
            ),
        );
    }
    (t, cols)
}

impl Engine {
    pub fn open(root: PathBuf, url: String) -> anyhow::Result<Self> {
        let lab = Lab::open(&root)?;
        Ok(Self {
            root,
            url,
            lab,
            live: None,
            next_id: 1,
            frames: 0,
        })
    }

    fn reload(&mut self) -> anyhow::Result<()> {
        self.lab = Lab::open(&self.root)?;
        Ok(())
    }

    fn info(&self) -> Value {
        let scenarios: Vec<Value> = self
            .lab
            .scenarios()
            .map(|s| json!({ "id": s.id, "name": s.name, "description": s.description, "tags": s.tags, "duration_s": s.duration_s, "airframe": s.airframe }))
            .collect();
        json!({
            "engine": { "name": "drone-engine", "version": env!("CARGO_PKG_VERSION"), "url": self.url },
            "root": self.root,
            "airframes": self.lab.repo.airframes.keys().collect::<Vec<_>>(),
            "scenarios": scenarios,
            "frame": { "kind": crate::live::FRAME_KIND_SAMPLE, "header_bytes": 8, "columns": columns(), "rate_hz": 60 },
            "params": flight_params(),
            "live": self.live.as_ref().map(Live::status),
        })
    }

    fn start(&mut self, p: &Value, bus: &broadcast::Sender<Outgoing>) -> anyhow::Result<Value> {
        let mode = if p["mode"].as_str() == Some("manual") {
            Mode::Manual
        } else {
            Mode::Scenario
        };
        let scenario = match mode {
            Mode::Manual => manual_scenario(p["airframe"].as_str().unwrap_or("palm_x4_2in")),
            Mode::Scenario => self
                .lab
                .scenario(p["scenario"].as_str().context("`scenario` is required")?)?
                .clone(),
        };
        let opts = SessionOptions {
            seed: p["seed"].as_u64(),
            params: overrides(p)?,
            record_every_ticks: 2,
            battery_soc: p["battery_soc"].as_f64(),
        };
        let id = self.next_id;
        self.next_id += 1;
        let live = Live::new(
            &self.lab,
            id,
            mode,
            scenario,
            opts,
            p["speed"].as_f64().unwrap_or(1.0),
        )?;
        let status = live.status();
        self.live = Some(live);
        let _ = bus.send(notification("sim.started", status.clone()));
        Ok(status)
    }

    fn stop(&mut self, bus: &broadcast::Sender<Outgoing>, record: bool) -> anyhow::Result<Value> {
        let Some(live) = self.live.take() else {
            return Ok(json!({ "stopped": false }));
        };
        let id = live.id;
        let out = live.finish();
        let rec = if record && out.samples.len() > 10 {
            let file = self
                .lab
                .scenario_file(&out.scenario.id)
                .unwrap_or_else(|| "studio".into());
            Some(drone_runner::record::record(
                &self.root,
                &self.lab.runs_dir(),
                "studio",
                &out,
                &file,
            )?)
        } else {
            None
        };
        let result = json!({
            "stopped": true,
            "session_id": id,
            "scenario": out.scenario.id,
            "result": if out.passed { "PASS" } else { "FAIL" },
            "run_id": rec.as_ref().map(|r| r.meta.run_id.clone()),
            "assertions": out.assertions,
        });
        let _ = bus.send(notification("sim.finished", result.clone()));
        let _ = bus.send(notification("runs.changed", json!({})));
        Ok(result)
    }

    pub fn tick(&mut self, dt: f64, bus: &broadcast::Sender<Outgoing>) {
        let Some(live) = self.live.as_mut() else {
            return;
        };
        let finished = match live.advance(dt) {
            Ok(f) => f,
            Err(e) => {
                let _ = bus.send(notification(
                    "sim.error",
                    json!({ "message": e.to_string() }),
                ));
                self.live = None;
                return;
            }
        };
        self.frames += 1;
        let _ = bus.send(Outgoing::Binary(live.frame()));
        let events = live.new_events();
        if !events.is_empty() {
            let _ = bus.send(notification(
                "sim.events",
                json!({ "session_id": live.id, "events": events }),
            ));
        }
        if self.frames.is_multiple_of(30) && !live.paused {
            let recent = live.recent_samples(1024);
            if recent.len() >= 256 {
                let az: Vec<f32> = recent.iter().map(|s| s.imu_az).collect();
                let gx: Vec<f32> = recent.iter().map(|s| s.imu_gx).collect();
                let a = spectrum::magnitude_spectrum(&az, 500.0);
                let g = spectrum::magnitude_spectrum(&gx, 500.0);
                let _ = bus.send(notification("telemetry.spectrum", json!({ "session_id": live.id, "freq_hz": a.freq_hz, "accel_z": a.magnitude, "gyro_x": g.magnitude })));
            }
        }
        if self.frames.is_multiple_of(15) {
            let _ = bus.send(notification("sim.status", live.status()));
        }
        if finished {
            let _ = self.stop(bus, true);
        }
    }

    pub fn handle(
        &mut self,
        method: &str,
        p: &Value,
        bus: &broadcast::Sender<Outgoing>,
    ) -> anyhow::Result<Value> {
        match method {
            "engine.info" => Ok(self.info()),
            "engine.reload" => {
                self.reload()?;
                Ok(self.info())
            }
            "hardware.layout" => {
                hardware::layout(&self.root, p["airframe"].as_str().unwrap_or("palm_x4_2in"))
            }
            "hardware.catalog" => Ok(hardware::catalog(&self.lab)),
            "hardware.preview" => hardware::preview(&self.lab, p),
            "scenarios.list" => Ok(self.info()["scenarios"].clone()),
            "sim.start" => self.start(p, bus),
            "sim.pause" => {
                let live = self.live.as_mut().context("no live session")?;
                live.paused = p["paused"].as_bool().unwrap_or(!live.paused);
                Ok(live.status())
            }
            "sim.speed" => {
                let live = self.live.as_mut().context("no live session")?;
                live.speed = p["speed"]
                    .as_f64()
                    .context("`speed` is required")?
                    .clamp(0.05, 20.0);
                Ok(live.status())
            }
            "sim.reset" => {
                let live = self.live.take().context("no live session")?;
                let restart = Live::new(
                    &self.lab,
                    self.next_id,
                    live.mode,
                    live.scenario.clone(),
                    live.opts.clone(),
                    live.speed,
                )?;
                self.next_id += 1;
                let status = restart.status();
                self.live = Some(restart);
                let _ = bus.send(notification("sim.started", status.clone()));
                Ok(status)
            }
            "sim.stop" => self.stop(bus, p["record"].as_bool().unwrap_or(true)),
            "sim.status" => Ok(self.live.as_ref().map_or(Value::Null, Live::status)),
            "rc.set" => {
                if let Some(live) = self.live.as_mut() {
                    live.set_rc(p);
                    Ok(live.rc())
                } else {
                    Ok(Value::Null)
                }
            }
            "runs.list" => {
                let limit = p["limit"].as_u64().unwrap_or(50) as usize;
                let runs: Vec<Value> = store::list_runs(&self.lab.runs_dir())
                    .into_iter()
                    .take(limit)
                    .map(|(_, m)| json!({ "run_id": m.run_id, "created_at": m.created_at, "scenario": m.scenario.id, "scenario_name": m.scenario.name, "result": m.result, "source": m.source, "seed": m.seed, "params": m.params, "duration_s": m.metrics.duration_s, "metrics": m.metrics, "assertions": m.assertions }))
                    .collect();
                Ok(json!({ "runs": runs }))
            }
            "runs.load" => {
                let dir = store::resolve_run(
                    &self.lab.runs_dir(),
                    p["run_id"].as_str().context("`run_id` is required")?,
                )?;
                let run = store::load_run(&dir)?;
                let (t, cols) = decimated(&run.samples, p["rate_hz"].as_f64().unwrap_or(100.0));
                let anomalies = drone_telemetry::analysis::anomalies(
                    &run.samples,
                    &run.events,
                    &drone_telemetry::Thresholds::default(),
                );
                Ok(
                    json!({ "meta": run.meta, "events": run.events, "anomalies": anomalies, "t": t, "columns": cols }),
                )
            }
            "runs.spectrum" => {
                let dir = store::resolve_run(
                    &self.lab.runs_dir(),
                    p["run_id"].as_str().context("`run_id` is required")?,
                )?;
                let run = store::load_run(&dir)?;
                let t = p["t"].as_f64().unwrap_or(f64::INFINITY);
                let window: Vec<&Sample> = run.samples.iter().filter(|s| s.t <= t).collect();
                let tail = &window[window.len().saturating_sub(1024)..];
                let rate = run.meta.sample_rate_hz.max(1.0);
                let a = spectrum::magnitude_spectrum(
                    &tail.iter().map(|s| s.imu_az).collect::<Vec<_>>(),
                    rate,
                );
                let g = spectrum::magnitude_spectrum(
                    &tail.iter().map(|s| s.imu_gx).collect::<Vec<_>>(),
                    rate,
                );
                Ok(json!({ "freq_hz": a.freq_hz, "accel_z": a.magnitude, "gyro_x": g.magnitude }))
            }
            "studio.focus" => {
                let run = p["run_id"].as_str().context("`run_id` is required")?;
                let dir = store::resolve_run(&self.lab.runs_dir(), run)?;
                let meta = store::read_meta(&dir)?;
                let delivered = bus
                    .send(notification(
                        "studio.focus",
                        json!({ "run_id": meta.run_id, "t": p["t"].as_f64() }),
                    ))
                    .unwrap_or(0);
                Ok(
                    json!({ "run_id": meta.run_id, "t": p["t"], "delivered_to": delivered.saturating_sub(1) }),
                )
            }
            "emu.status" => Ok(emu_status(&self.root)),
            "emu.smoke" => Ok(start_emu_smoke(&self.root, bus)),
            "real.status" => Ok(
                json!({ "connected": false, "link": "none", "policy": "read-only", "detail": "Real hardware links arrive in M2 behind the Safety Gate. Until then Studio never sends commands to a physical board." }),
            ),
            "" => bail!("missing method"),
            other => bail!("unknown method `{other}`"),
        }
    }
}

fn flight_params() -> Value {
    json!(flight_core_names())
}

fn flight_core_names() -> Vec<&'static str> {
    drone_runner::param_names().to_vec()
}

fn drone_command(root: &std::path::Path) -> Command {
    let sibling = std::env::current_exe()
        .ok()
        .map(|exe| exe.with_file_name(if cfg!(windows) { "drone.exe" } else { "drone" }))
        .filter(|p| p.is_file());
    let mut cmd = match sibling {
        Some(bin) => Command::new(bin),
        None => {
            let mut c = Command::new("cargo");
            c.args(["run", "-q", "--release", "-p", "drone-cli", "--"]);
            c
        }
    };
    cmd.current_dir(root);
    cmd
}

fn start_emu_smoke(root: &std::path::Path, bus: &broadcast::Sender<Outgoing>) -> Value {
    let mut cmd = drone_command(root);
    cmd.args(["--json", "emu", "smoke"]);
    let bus = bus.clone();
    let _ = bus.send(notification("emu.smoke.started", json!({})));
    std::thread::spawn(move || {
        let report = match cmd.output() {
            Ok(out) => serde_json::from_slice::<Value>(&out.stdout).unwrap_or_else(|_| {
                json!({ "ok": false, "error": String::from_utf8_lossy(&out.stderr).lines().last().unwrap_or("drone emu smoke failed").to_owned() })
            }),
            Err(e) => json!({ "ok": false, "error": e.to_string() }),
        };
        let _ = bus.send(notification("emu.smoke.finished", report));
    });
    json!({ "started": true })
}

fn emu_status(root: &std::path::Path) -> Value {
    let docker = Command::new("docker")
        .args(["version", "--format", "{{.Server.Version}}"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_owned());
    let last = std::fs::read_to_string(root.join(".dev/emu-last.json"))
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok());
    let elf =
        root.join("firmware/target-stm32h7/target/thumbv7em-none-eabihf/release/target-stm32h7");
    json!({
        "docker": docker,
        "elf_built": elf.is_file(),
        "repl": root.join("emu/generated/ref_h743_aio.repl").is_file(),
        "last_smoke": last,
        "hint": "Run `drone emu smoke` (or the emu_smoke_test MCP tool) to boot the firmware in Renode.",
    })
}
