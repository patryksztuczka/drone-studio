use std::path::PathBuf;

fn hardware() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../hardware")
}

#[test]
fn reference_hardware_is_valid() {
    let (repo, diags) = drone_schema::validate(&hardware());
    for d in &diags.items {
        eprintln!("{d}");
    }
    assert!(!diags.has_errors());
    assert!(repo.airframes.contains_key("palm_x4_2in"));
    assert_eq!(repo.scenarios.len(), 5);
    let r = drone_schema::resolve::resolve(&repo, "palm_x4_2in").unwrap();
    eprintln!(
        "{}",
        serde_json::to_string_pretty(&r.model.derived).unwrap()
    );
    eprintln!(
        "mass {} com {:?} inertia {:?}",
        r.model.mass_kg, r.model.center_of_mass_m, r.model.inertia_kg_m2
    );
    let m = &r.model;
    assert!(m.mass_kg > 0.105 && m.mass_kg < 0.135);
    assert!(m.derived.thrust_to_weight > 3.0);
}
