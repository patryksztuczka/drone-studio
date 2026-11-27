use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::diagnostics::Diagnostics;
use crate::manifest::{Airframe, Battery, Board, Frame, Mcu, Motor, Prop, Scenario, Sensor};

const SCHEMA_BASE: &str = "https://drone-studio.local/schemas/";

#[derive(Clone, Debug)]
pub struct Located<T> {
    pub file: String,
    pub value: T,
}

#[derive(Clone, Debug, Default)]
pub struct Repository {
    pub root: PathBuf,
    pub files_checked: usize,
    pub mcus: BTreeMap<String, Located<Mcu>>,
    pub sensors: BTreeMap<String, Located<Sensor>>,
    pub motors: BTreeMap<String, Located<Motor>>,
    pub props: BTreeMap<String, Located<Prop>>,
    pub batteries: BTreeMap<String, Located<Battery>>,
    pub frames: BTreeMap<String, Located<Frame>>,
    pub boards: BTreeMap<String, Located<Board>>,
    pub airframes: BTreeMap<String, Located<Airframe>>,
    pub scenarios: BTreeMap<String, Located<Scenario>>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ManifestKind {
    Mcu,
    Sensor,
    Motor,
    Prop,
    Battery,
    Frame,
    Board,
    Airframe,
    Scenario,
}

impl ManifestKind {
    pub const ALL: [Self; 9] = [
        Self::Mcu,
        Self::Sensor,
        Self::Motor,
        Self::Prop,
        Self::Battery,
        Self::Frame,
        Self::Board,
        Self::Airframe,
        Self::Scenario,
    ];

    pub const fn schema_file(self) -> &'static str {
        match self {
            Self::Mcu => "mcu.schema.json",
            Self::Sensor => "sensor.schema.json",
            Self::Motor => "motor.schema.json",
            Self::Prop => "prop.schema.json",
            Self::Battery => "battery.schema.json",
            Self::Frame => "frame.schema.json",
            Self::Board => "board.schema.json",
            Self::Airframe => "airframe.schema.json",
            Self::Scenario => "scenario.schema.json",
        }
    }

    const fn directory(self) -> &'static str {
        match self {
            Self::Mcu => "catalog/mcus",
            Self::Sensor => "catalog/sensors",
            Self::Motor => "catalog/motors",
            Self::Prop => "catalog/props",
            Self::Battery => "catalog/batteries",
            Self::Frame => "catalog/frames",
            Self::Board => "boards",
            Self::Airframe => "airframes",
            Self::Scenario => "scenarios",
        }
    }
}

struct SchemaSet {
    validators: Vec<(ManifestKind, jsonschema::Validator)>,
}

fn load_schemas(root: &Path, diags: &mut Diagnostics) -> Option<SchemaSet> {
    let dir = root.join("schemas");
    let mut documents: Vec<(String, Value)> = Vec::new();
    let mut names: Vec<String> = ManifestKind::ALL
        .iter()
        .map(|k| k.schema_file().to_owned())
        .collect();
    names.push("common.schema.json".to_owned());
    for name in &names {
        let file = format!("schemas/{name}");
        match fs::read_to_string(dir.join(name)) {
            Ok(text) => match serde_json::from_str::<Value>(&text) {
                Ok(v) => documents.push((name.clone(), v)),
                Err(e) => diags.error("schema.parse", &file, "", e.to_string()),
            },
            Err(e) => diags.error("schema.missing", &file, "", e.to_string()),
        }
    }
    if diags.has_errors() {
        return None;
    }
    let mut builder = jsonschema::Registry::new();
    for (name, doc) in &documents {
        match builder.add(format!("{SCHEMA_BASE}{name}"), doc) {
            Ok(b) => builder = b,
            Err(e) => {
                diags.error(
                    "schema.registry",
                    &format!("schemas/{name}"),
                    "",
                    e.to_string(),
                );
                return None;
            }
        }
    }
    let registry = match builder.prepare() {
        Ok(r) => r,
        Err(e) => {
            diags.error("schema.registry", "schemas", "", e.to_string());
            return None;
        }
    };
    let mut validators = Vec::new();
    for kind in ManifestKind::ALL {
        let Some((_, doc)) = documents.iter().find(|(n, _)| n == kind.schema_file()) else {
            continue;
        };
        match jsonschema::options().with_registry(&registry).build(doc) {
            Ok(v) => validators.push((kind, v)),
            Err(e) => diags.error(
                "schema.invalid",
                &format!("schemas/{}", kind.schema_file()),
                "",
                e.to_string(),
            ),
        }
    }
    Some(SchemaSet { validators })
}

fn manifest_files(root: &Path, kind: ManifestKind) -> Vec<PathBuf> {
    let dir = root.join(kind.directory());
    let Ok(entries) = fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut files: Vec<PathBuf> = entries
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter_map(|p| {
            if kind == ManifestKind::Airframe {
                let f = p.join("airframe.yaml");
                p.is_dir().then_some(f)
            } else {
                let is_yaml = p.extension().is_some_and(|e| e == "yaml" || e == "yml");
                is_yaml.then_some(p)
            }
        })
        .collect();
    files.sort();
    files
}

fn relative(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn expected_id(kind: ManifestKind, path: &Path) -> Option<String> {
    let p = if kind == ManifestKind::Airframe {
        path.parent()?
    } else {
        path
    };
    let name = if kind == ManifestKind::Airframe {
        p.file_name()?
    } else {
        p.file_stem()?
    };
    Some(name.to_string_lossy().into_owned())
}

fn parse_file<T: DeserializeOwned>(
    root: &Path,
    path: &Path,
    kind: ManifestKind,
    schemas: &SchemaSet,
    diags: &mut Diagnostics,
) -> Option<Located<T>> {
    let file = relative(root, path);
    let text = match fs::read_to_string(path) {
        Ok(t) => t,
        Err(e) => {
            diags.error("io.read", &file, "", e.to_string());
            return None;
        }
    };
    let json: Value = match serde_yaml_ng::from_str(&text) {
        Ok(v) => v,
        Err(e) => {
            diags.error("yaml.parse", &file, "", e.to_string());
            return None;
        }
    };
    let validator = schemas
        .validators
        .iter()
        .find(|(k, _)| *k == kind)
        .map(|(_, v)| v)?;
    let before = diags.error_count();
    for error in validator.iter_errors(&json) {
        diags.error(
            "schema.violation",
            &file,
            &error.instance_path().to_string(),
            error.to_string(),
        );
    }
    if diags.error_count() > before {
        return None;
    }
    let id = json
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    if let Some(expected) = expected_id(kind, path)
        && expected != id
    {
        diags.error(
            "manifest.id_mismatch",
            &file,
            "/id",
            format!("id `{id}` must match its file name `{expected}`"),
        );
    }
    match serde_json::from_value::<T>(json) {
        Ok(value) => Some(Located { file, value }),
        Err(e) => {
            diags.error("manifest.parse", &file, "", e.to_string());
            None
        }
    }
}

fn load_kind<T: DeserializeOwned>(
    repo_root: &Path,
    kind: ManifestKind,
    schemas: &SchemaSet,
    diags: &mut Diagnostics,
    id_of: fn(&T) -> &str,
    files_checked: &mut usize,
) -> BTreeMap<String, Located<T>> {
    let mut out: BTreeMap<String, Located<T>> = BTreeMap::new();
    for path in manifest_files(repo_root, kind) {
        *files_checked += 1;
        let Some(item) = parse_file::<T>(repo_root, &path, kind, schemas, diags) else {
            continue;
        };
        let id = id_of(&item.value).to_owned();
        if let Some(existing) = out.get(&id) {
            diags.error(
                "manifest.duplicate_id",
                &item.file,
                "/id",
                format!("id `{id}` is already defined in {}", existing.file),
            );
            continue;
        }
        out.insert(id, item);
    }
    out
}

pub fn load(root: &Path) -> (Repository, Diagnostics) {
    let mut diags = Diagnostics::default();
    let mut repo = Repository {
        root: root.to_path_buf(),
        ..Repository::default()
    };
    if !root.is_dir() {
        diags.error(
            "io.root",
            &root.to_string_lossy(),
            "",
            "hardware directory not found",
        );
        return (repo, diags);
    }
    let Some(schemas) = load_schemas(root, &mut diags) else {
        return (repo, diags);
    };
    let mut n = 0;
    repo.mcus = load_kind(
        root,
        ManifestKind::Mcu,
        &schemas,
        &mut diags,
        |m: &Mcu| &m.id,
        &mut n,
    );
    repo.sensors = load_kind(
        root,
        ManifestKind::Sensor,
        &schemas,
        &mut diags,
        |m: &Sensor| &m.id,
        &mut n,
    );
    repo.motors = load_kind(
        root,
        ManifestKind::Motor,
        &schemas,
        &mut diags,
        |m: &Motor| &m.id,
        &mut n,
    );
    repo.props = load_kind(
        root,
        ManifestKind::Prop,
        &schemas,
        &mut diags,
        |m: &Prop| &m.id,
        &mut n,
    );
    repo.batteries = load_kind(
        root,
        ManifestKind::Battery,
        &schemas,
        &mut diags,
        |m: &Battery| &m.id,
        &mut n,
    );
    repo.frames = load_kind(
        root,
        ManifestKind::Frame,
        &schemas,
        &mut diags,
        |m: &Frame| &m.id,
        &mut n,
    );
    repo.boards = load_kind(
        root,
        ManifestKind::Board,
        &schemas,
        &mut diags,
        |m: &Board| &m.id,
        &mut n,
    );
    repo.airframes = load_kind(
        root,
        ManifestKind::Airframe,
        &schemas,
        &mut diags,
        |m: &Airframe| &m.id,
        &mut n,
    );
    repo.scenarios = load_kind(
        root,
        ManifestKind::Scenario,
        &schemas,
        &mut diags,
        |m: &Scenario| &m.id,
        &mut n,
    );
    repo.files_checked = n;
    (repo, diags)
}
