use std::fs::{self, File};
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use arrow_array::{Array, ArrayRef, Float32Array, Float64Array, RecordBatch};
use arrow_schema::{DataType, Field, Schema};
use parquet::arrow::ArrowWriter;
use parquet::arrow::arrow_reader::ParquetRecordBatchReaderBuilder;
use parquet::basic::Compression;
use parquet::file::properties::WriterProperties;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::analysis::Summary;
use crate::event::Event;
use crate::sample::{COLUMNS, Sample};

pub const META_FILE: &str = "meta.json";
pub const TELEMETRY_FILE: &str = "telemetry.parquet";
pub const EVENTS_FILE: &str = "events.jsonl";
pub const FORMAT_VERSION: u32 = 1;

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    Parquet(#[from] parquet::errors::ParquetError),
    #[error("{0}")]
    Arrow(#[from] arrow_schema::ArrowError),
    #[error("no run matches `{0}`")]
    NotFound(String),
    #[error("`{0}` matches several runs: {1}")]
    Ambiguous(String, String),
    #[error("telemetry column `{0}` is missing or has the wrong type")]
    Column(String),
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct GitInfo {
    pub sha: String,
    pub dirty: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct AirframeRef {
    pub id: String,
    pub source_hash: String,
    pub firmware_hash: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ScenarioRef {
    pub id: String,
    pub name: String,
    pub file: String,
    pub tags: Vec<String>,
    pub duration_s: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct RunMeta {
    pub format_version: u32,
    pub run_id: String,
    pub created_at: String,
    pub source: String,
    pub git: GitInfo,
    pub airframe: AirframeRef,
    pub scenario: ScenarioRef,
    pub seed: u64,
    pub params: std::collections::BTreeMap<String, f64>,
    pub result: String,
    pub assertions: Vec<Value>,
    pub metrics: Summary,
    pub sample_rate_hz: f64,
    pub samples: usize,
    pub wall_time_s: f64,
    pub realtime_factor: f64,
    pub columns: Vec<String>,
}

pub fn utc_timestamp(unix_s: u64) -> (String, String) {
    let days = (unix_s / 86_400) as i64;
    let secs = unix_s % 86_400;
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    let (h, mi, s) = (secs / 3600, secs / 60 % 60, secs % 60);
    (
        format!("{y:04}-{m:02}-{d:02}T{h:02}:{mi:02}:{s:02}Z"),
        format!("{y:04}{m:02}{d:02}T{h:02}{mi:02}{s:02}Z"),
    )
}

pub fn new_run_dir(
    runs_dir: &Path,
    compact_time: &str,
    slug: &str,
) -> std::io::Result<(String, PathBuf)> {
    fs::create_dir_all(runs_dir)?;
    for n in 1.. {
        let id = if n == 1 {
            format!("{compact_time}_{slug}")
        } else {
            format!("{compact_time}_{slug}_{n}")
        };
        let dir = runs_dir.join(&id);
        match fs::create_dir(&dir) {
            Ok(()) => return Ok((id, dir)),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e),
        }
    }
    unreachable!("the loop above only exits by returning")
}

pub fn write_samples(path: &Path, samples: &[Sample]) -> Result<(), StoreError> {
    let mut fields = vec![Field::new("t", DataType::Float64, false)];
    for (name, unit) in COLUMNS {
        let mut f = Field::new(*name, DataType::Float32, false);
        if !unit.is_empty() {
            f = f.with_metadata(std::collections::HashMap::from([(
                "unit".to_owned(),
                (*unit).to_owned(),
            )]));
        }
        fields.push(f);
    }
    let schema = Arc::new(Schema::new(fields));
    let mut arrays: Vec<ArrayRef> = Vec::with_capacity(COLUMNS.len() + 1);
    arrays.push(Arc::new(Float64Array::from(
        samples.iter().map(|s| s.t).collect::<Vec<_>>(),
    )));
    let rows: Vec<_> = samples.iter().map(Sample::values).collect();
    for i in 0..COLUMNS.len() {
        arrays.push(Arc::new(Float32Array::from(
            rows.iter().map(|r| r[i]).collect::<Vec<_>>(),
        )));
    }
    let batch = RecordBatch::try_new(schema.clone(), arrays)?;
    let props = WriterProperties::builder()
        .set_compression(Compression::SNAPPY)
        .set_created_by(format!("drone-telemetry {}", env!("CARGO_PKG_VERSION")))
        .build();
    let mut writer = ArrowWriter::try_new(File::create(path)?, schema, Some(props))?;
    writer.write(&batch)?;
    writer.close()?;
    Ok(())
}

pub fn read_samples(path: &Path) -> Result<Vec<Sample>, StoreError> {
    let reader = ParquetRecordBatchReaderBuilder::try_new(File::open(path)?)?.build()?;
    let mut out = Vec::new();
    for batch in reader {
        let batch = batch?;
        let t = batch
            .column_by_name("t")
            .and_then(|c| c.as_any().downcast_ref::<Float64Array>().cloned())
            .ok_or_else(|| StoreError::Column("t".into()))?;
        let start = out.len();
        out.extend(t.values().iter().map(|t| Sample {
            t: *t,
            ..Sample::default()
        }));
        for (name, _) in COLUMNS {
            let Some(col) = batch.column_by_name(name) else {
                continue;
            };
            let col = col
                .as_any()
                .downcast_ref::<Float32Array>()
                .ok_or_else(|| StoreError::Column((*name).to_owned()))?;
            for (i, v) in col.values().iter().enumerate() {
                out[start + i].set(name, *v);
            }
        }
        let _ = t.len();
    }
    Ok(out)
}

pub fn write_events(path: &Path, events: &[Event]) -> Result<(), StoreError> {
    let mut w = BufWriter::new(File::create(path)?);
    for e in events {
        serde_json::to_writer(&mut w, e)?;
        w.write_all(b"\n")?;
    }
    w.flush()?;
    Ok(())
}

pub fn read_events(path: &Path) -> Result<Vec<Event>, StoreError> {
    let r = BufReader::new(File::open(path)?);
    let mut out = Vec::new();
    for line in r.lines() {
        let line = line?;
        if !line.trim().is_empty() {
            out.push(serde_json::from_str(&line)?);
        }
    }
    Ok(out)
}

pub fn write_meta(path: &Path, meta: &RunMeta) -> Result<(), StoreError> {
    let mut s = serde_json::to_string_pretty(meta)?;
    s.push('\n');
    fs::write(path, s)?;
    Ok(())
}

pub fn read_meta(run_dir: &Path) -> Result<RunMeta, StoreError> {
    Ok(serde_json::from_str(&fs::read_to_string(
        run_dir.join(META_FILE),
    )?)?)
}

pub fn list_runs(runs_dir: &Path) -> Vec<(PathBuf, RunMeta)> {
    let Ok(entries) = fs::read_dir(runs_dir) else {
        return Vec::new();
    };
    let mut runs: Vec<(PathBuf, RunMeta)> = entries
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| p.join(META_FILE).is_file())
        .filter_map(|p| read_meta(&p).ok().map(|m| (p, m)))
        .collect();
    runs.sort_by(|a, b| b.1.run_id.cmp(&a.1.run_id));
    runs
}

pub fn resolve_run(runs_dir: &Path, query: &str) -> Result<PathBuf, StoreError> {
    let direct = Path::new(query);
    if direct.join(META_FILE).is_file() {
        return Ok(direct.to_path_buf());
    }
    let runs = list_runs(runs_dir);
    if query == "latest" {
        return runs
            .into_iter()
            .next()
            .map(|r| r.0)
            .ok_or_else(|| StoreError::NotFound(query.into()));
    }
    if let Some((p, _)) = runs.iter().find(|(_, m)| m.run_id == query) {
        return Ok(p.clone());
    }
    if let Some((p, _)) = runs.iter().find(|(_, m)| m.scenario.id == query) {
        return Ok(p.clone());
    }
    let matches: Vec<&(PathBuf, RunMeta)> = runs
        .iter()
        .filter(|(_, m)| m.run_id.starts_with(query) || m.run_id.ends_with(query))
        .collect();
    match matches.as_slice() {
        [] => Err(StoreError::NotFound(query.into())),
        [one] => Ok(one.0.clone()),
        many => Err(StoreError::Ambiguous(
            query.into(),
            many.iter()
                .take(5)
                .map(|r| r.1.run_id.clone())
                .collect::<Vec<_>>()
                .join(", "),
        )),
    }
}

pub struct LoadedRun {
    pub dir: PathBuf,
    pub meta: RunMeta,
    pub samples: Vec<Sample>,
    pub events: Vec<Event>,
}

pub fn load_run(run_dir: &Path) -> Result<LoadedRun, StoreError> {
    Ok(LoadedRun {
        dir: run_dir.to_path_buf(),
        meta: read_meta(run_dir)?,
        samples: read_samples(&run_dir.join(TELEMETRY_FILE))?,
        events: read_events(&run_dir.join(EVENTS_FILE))?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utc_formatting() {
        assert_eq!(utc_timestamp(0).0, "1970-01-01T00:00:00Z");
        assert_eq!(utc_timestamp(1_795_783_530).1, "20261127T124530Z");
        assert_eq!(utc_timestamp(951_782_400).0, "2000-02-29T00:00:00Z");
    }

    #[test]
    fn samples_round_trip_through_parquet() {
        let dir = std::env::temp_dir().join(format!("drone-telemetry-{}", std::process::id()));
        fs::create_dir_all(&dir).expect("temp dir");
        let samples: Vec<Sample> = (0..1000)
            .map(|i| Sample {
                t: f64::from(i) * 0.002,
                roll: (i as f32 * 0.1).sin(),
                bat_v: 8.0 - i as f32 * 0.001,
                motor_3: 0.5,
                ..Sample::default()
            })
            .collect();
        let path = dir.join(TELEMETRY_FILE);
        write_samples(&path, &samples).expect("write");
        let back = read_samples(&path).expect("read");
        assert_eq!(back, samples);
        let events = vec![Event::new(1.0, "ARM", serde_json::json!({"x": 1}))];
        write_events(&dir.join(EVENTS_FILE), &events).expect("write events");
        assert_eq!(
            read_events(&dir.join(EVENTS_FILE)).expect("read events"),
            events
        );
        let _ = fs::remove_dir_all(&dir);
    }
}
