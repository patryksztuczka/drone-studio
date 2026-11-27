use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

use drone_telemetry::store::{
    self, AirframeRef, EVENTS_FILE, FORMAT_VERSION, GitInfo, META_FILE, RunMeta, ScenarioRef,
    StoreError, TELEMETRY_FILE,
};
use drone_telemetry::{COLUMNS, analysis};

use crate::RunOutput;

fn git_info(root: &Path) -> GitInfo {
    static CACHE: OnceLock<GitInfo> = OnceLock::new();
    CACHE
        .get_or_init(|| {
            let run = |args: &[&str]| {
                Command::new("git")
                    .args(args)
                    .current_dir(root)
                    .output()
                    .ok()
                    .filter(|o| o.status.success())
                    .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_owned())
            };
            GitInfo {
                sha: run(&["rev-parse", "--short=12", "HEAD"]).unwrap_or_else(|| "unknown".into()),
                dirty: run(&["status", "--porcelain", "--untracked-files=no"])
                    .is_some_and(|s| !s.is_empty()),
            }
        })
        .clone()
}

pub struct Recorded {
    pub dir: PathBuf,
    pub meta: RunMeta,
}

pub fn record(
    root: &Path,
    runs_dir: &Path,
    source: &str,
    out: &RunOutput,
    scenario_file: &str,
) -> Result<Recorded, StoreError> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs());
    let (created_at, compact) = store::utc_timestamp(now);
    let (run_id, dir) = store::new_run_dir(runs_dir, &compact, &out.scenario.id)?;
    let fw =
        flight_config::by_id(&out.model.id).map_or_else(String::new, |f| f.source_hash.to_owned());
    let rate = match out.samples.as_slice() {
        [a, b, ..] => (1.0 / (b.t - a.t)).round(),
        _ => 0.0,
    };
    let meta = RunMeta {
        format_version: FORMAT_VERSION,
        run_id,
        created_at,
        source: source.to_owned(),
        git: git_info(root),
        airframe: AirframeRef {
            id: out.model.id.clone(),
            source_hash: out.model.source_hash.clone(),
            firmware_hash: fw,
        },
        scenario: ScenarioRef {
            id: out.scenario.id.clone(),
            name: out.scenario.name.clone(),
            file: scenario_file.to_owned(),
            tags: out.scenario.tags.clone(),
            duration_s: out.scenario.duration_s,
        },
        seed: out.seed,
        params: out.params.clone(),
        result: if out.passed {
            "PASS".into()
        } else {
            "FAIL".into()
        },
        assertions: out
            .assertions
            .iter()
            .map(|a| serde_json::to_value(a).unwrap_or_default())
            .collect(),
        metrics: analysis::summary(&out.samples, &out.events),
        sample_rate_hz: rate,
        samples: out.samples.len(),
        wall_time_s: (out.wall_time_s * 1e4).round() / 1e4,
        realtime_factor: out.realtime_factor().round(),
        columns: std::iter::once("t")
            .chain(COLUMNS.iter().map(|c| c.0))
            .map(str::to_owned)
            .collect(),
    };
    store::write_samples(&dir.join(TELEMETRY_FILE), &out.samples)?;
    store::write_events(&dir.join(EVENTS_FILE), &out.events)?;
    store::write_meta(&dir.join(META_FILE), &meta)?;
    Ok(Recorded { dir, meta })
}
