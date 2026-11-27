use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

static COUNTER: AtomicUsize = AtomicUsize::new(0);

fn source() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../hardware")
}

fn copy_dir(from: &Path, to: &Path) {
    fs::create_dir_all(to).expect("test fixture");
    for entry in fs::read_dir(from).expect("test fixture") {
        let entry = entry.expect("test fixture");
        let target = to.join(entry.file_name());
        if entry.file_type().expect("test fixture").is_dir() {
            if entry.file_name() == "generated" {
                continue;
            }
            copy_dir(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), target).expect("test fixture");
        }
    }
}

struct Fixture {
    root: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let root = std::env::temp_dir().join(format!("drone-schema-{}-{n}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        copy_dir(&source(), &root);
        Self { root }
    }

    fn edit(&self, file: &str, from: &str, to: &str) -> &Self {
        let path = self.root.join(file);
        let text = fs::read_to_string(&path).expect("test fixture");
        assert!(text.contains(from), "{file} does not contain {from}");
        fs::write(&path, text.replacen(from, to, 1)).expect("test fixture");
        self
    }

    fn codes(&self) -> Vec<String> {
        let (_, diags) = drone_schema::validate(&self.root);
        diags
            .items
            .iter()
            .filter(|d| d.severity == drone_schema::Severity::Error)
            .map(|d| format!("{} {}", d.code, d.message))
            .collect()
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn assert_has(codes: &[String], code: &str, fragment: &str) {
    assert!(
        codes
            .iter()
            .any(|c| c.starts_with(code) && c.contains(fragment)),
        "expected {code} containing `{fragment}`, got {codes:#?}"
    );
}

#[test]
fn copy_of_reference_is_valid() {
    assert!(Fixture::new().codes().is_empty());
}

#[test]
fn missing_component_reference() {
    let f = Fixture::new();
    f.edit(
        "airframes/palm_x4_2in/airframe.yaml",
        "battery: 2s_550mah_lihv",
        "battery: 3s_1000mah",
    );
    assert_has(&f.codes(), "ref.missing", "unknown battery `3s_1000mah`");
}

#[test]
fn missing_sensor_and_bus_reference() {
    let f = Fixture::new();
    f.edit(
        "boards/ref_h743_aio.yaml",
        "component: icm42688p",
        "component: bmi270",
    );
    f.edit("boards/ref_h743_aio.yaml", "bus: i2c2", "bus: i2c9");
    let codes = f.codes();
    assert_has(&codes, "ref.missing", "unknown sensor `bmi270`");
    assert_has(&codes, "ref.missing", "unknown bus `i2c9`");
}

#[test]
fn duplicate_rotor_ids() {
    let f = Fixture::new();
    f.edit(
        "airframes/palm_x4_2in/airframe.yaml",
        "{ id: m2, output: m2",
        "{ id: m1, output: m2",
    );
    assert_has(&f.codes(), "ref.duplicate", "duplicate rotor id `m1`");
}

#[test]
fn duplicate_bus_ids_and_pin_conflict() {
    let f = Fixture::new();
    f.edit(
        "boards/ref_h743_aio.yaml",
        "  - id: i2c2\n",
        "  - id: spi1\n",
    );
    f.edit(
        "boards/ref_h743_aio.yaml",
        "{ id: m2, timer: tim3, channel: 4, pin: PB1 }",
        "{ id: m2, timer: tim3, channel: 4, pin: PB0 }",
    );
    let codes = f.codes();
    assert_has(&codes, "ref.duplicate", "duplicate bus id `spi1`");
    assert_has(&codes, "pin.conflict", "pin PB0");
}

#[test]
fn out_of_range_physical_parameter_is_a_schema_error() {
    let f = Fixture::new();
    f.edit(
        "catalog/motors/1202_5_8000kv.yaml",
        "kv_rpm_per_v: 8000",
        "kv_rpm_per_v: 90000",
    );
    assert_has(&f.codes(), "schema.violation", "90000");
}

#[test]
fn unknown_field_is_rejected() {
    let f = Fixture::new();
    f.edit(
        "catalog/props/gemfan_2023_3blade.yaml",
        "blades: 3",
        "blades: 3\ncolour: red",
    );
    assert_has(&f.codes(), "schema.violation", "colour");
}

#[test]
fn too_heavy_airframe_fails_physics_check() {
    let f = Fixture::new();
    f.edit(
        "airframes/palm_x4_2in/airframe.yaml",
        "{ id: camera_vtx, mass_g: 12.0",
        "{ id: camera_vtx, mass_g: 400.0",
    );
    let codes = f.codes();
    assert_has(&codes, "physics.mass", "250 g");
    assert_has(&codes, "physics.thrust", "thrust-to-weight");
}

#[test]
fn wrong_spin_layout_is_rejected() {
    let f = Fixture::new();
    f.edit(
        "airframes/palm_x4_2in/airframe.yaml",
        "34.65, -6.0], spin: cw }",
        "34.65, -6.0], spin: ccw }",
    );
    assert_has(&f.codes(), "airframe.spin", "two CW and two CCW");
}

#[test]
fn spi_device_on_i2c_bus() {
    let f = Fixture::new();
    f.edit(
        "boards/ref_h743_aio.yaml",
        "    bus: spi1\n",
        "    bus: i2c2\n",
    );
    assert_has(&f.codes(), "ref.bus_kind", "talks spi");
}

#[test]
fn scenario_fault_on_unknown_motor_and_bad_window() {
    let f = Fixture::new();
    f.edit(
        "scenarios/04_motor_loss_recovery.yaml",
        "motor: m2",
        "motor: m9",
    );
    f.edit(
        "scenarios/01_hover_calm.yaml",
        "window: [4, 10]",
        "window: [4, 30]",
    );
    let codes = f.codes();
    assert_has(&codes, "ref.missing", "no rotor `m9`");
    assert_has(&codes, "scenario.window", "[4, 30]");
}

#[test]
fn file_name_must_match_id() {
    let f = Fixture::new();
    f.edit("catalog/sensors/bmp390.yaml", "id: bmp390", "id: bmp388");
    assert_has(&f.codes(), "manifest.id_mismatch", "bmp388");
}

#[test]
fn codegen_is_deterministic_and_detects_staleness() {
    let f = Fixture::new();
    let (repo, diags) = drone_schema::validate(&f.root);
    assert!(!diags.has_errors());
    let a = drone_schema::codegen::generate(&repo).expect("test fixture");
    let b = drone_schema::codegen::generate(&repo).expect("test fixture");
    assert_eq!(a, b);
    let out = f.root.join("out");
    drone_schema::codegen::write(&out, &a).expect("test fixture");
    let clean = drone_schema::codegen::check(&out, &a);
    assert!(
        clean
            .iter()
            .all(|r| r.status == drone_schema::codegen::FileStatus::Unchanged)
    );

    f.edit(
        "catalog/batteries/2s_550mah_lihv.yaml",
        "mass_g: 33",
        "mass_g: 36",
    );
    let (repo2, _) = drone_schema::validate(&f.root);
    let c = drone_schema::codegen::generate(&repo2).expect("test fixture");
    let stale = drone_schema::codegen::check(&out, &c);
    assert!(
        stale
            .iter()
            .any(|r| r.status == drone_schema::codegen::FileStatus::Stale)
    );
}
