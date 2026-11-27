use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use drone_schema::manifest::Scenario;
use drone_schema::{Diagnostic, Repository};
use drone_sim::AirframeModel;

#[derive(Debug, thiserror::Error)]
pub enum LabError {
    #[error("hardware manifests have {} error(s); run `drone validate`", .0.len())]
    Manifests(Vec<Diagnostic>),
    #[error("generated model {0} is missing or stale; run `drone codegen`")]
    StaleModel(String),
    #[error(
        "firmware constants for `{0}` were built from other manifests; run `drone codegen` and rebuild"
    )]
    StaleFirmware(String),
    #[error("unknown scenario `{0}`")]
    UnknownScenario(String),
    #[error("unknown airframe `{0}`")]
    UnknownAirframe(String),
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    Resolve(#[from] drone_schema::resolve::ResolveError),
}

pub struct Lab {
    pub root: PathBuf,
    pub repo: Repository,
    models: BTreeMap<String, AirframeModel>,
}

impl Lab {
    pub fn open(root: &Path) -> Result<Self, LabError> {
        let (repo, diags) = drone_schema::validate(&root.join("hardware"));
        if diags.has_errors() {
            return Err(LabError::Manifests(diags.sorted()));
        }
        let mut models = BTreeMap::new();
        for id in repo.airframes.keys() {
            let rel = format!("hardware/generated/{id}/airframe_model.json");
            let text = fs::read_to_string(root.join(&rel))
                .map_err(|_| LabError::StaleModel(rel.clone()))?;
            let model: AirframeModel = serde_json::from_str(&text)?;
            let fresh = drone_schema::resolve::resolve(&repo, id)?.model;
            if fresh != model {
                return Err(LabError::StaleModel(rel));
            }
            if let Some(fw) = flight_config::by_id(id)
                && fw.source_hash != model.source_hash
            {
                return Err(LabError::StaleFirmware(id.clone()));
            }
            models.insert(id.clone(), model);
        }
        Ok(Self {
            root: root.to_path_buf(),
            repo,
            models,
        })
    }

    pub fn runs_dir(&self) -> PathBuf {
        self.root.join("runs")
    }

    pub fn model(&self, airframe: &str) -> Result<&AirframeModel, LabError> {
        self.models
            .get(airframe)
            .ok_or_else(|| LabError::UnknownAirframe(airframe.to_owned()))
    }

    pub fn scenario(&self, id: &str) -> Result<&Scenario, LabError> {
        let key = Path::new(id)
            .file_stem()
            .map_or_else(|| id.to_owned(), |s| s.to_string_lossy().into_owned());
        self.repo
            .scenarios
            .get(&key)
            .map(|l| &l.value)
            .ok_or(LabError::UnknownScenario(id.to_owned()))
    }

    pub fn scenarios(&self) -> impl Iterator<Item = &Scenario> {
        self.repo.scenarios.values().map(|l| &l.value)
    }

    pub fn scenario_file(&self, id: &str) -> Option<String> {
        self.repo
            .scenarios
            .get(id)
            .map(|l| format!("hardware/{}", l.file))
    }
}
