use std::fs;
use std::path::Path;

use anyhow::Context;
use drone_runner::Lab;
use serde_json::{Value, json};

pub fn layout(root: &Path, airframe: &str) -> anyhow::Result<Value> {
    let path = root.join(format!("hardware/generated/{airframe}/board_layout.json"));
    let text = fs::read_to_string(&path)
        .with_context(|| format!("{} is missing; run `drone codegen`", path.display()))?;
    Ok(serde_json::from_str(&text)?)
}

pub fn catalog(lab: &Lab) -> Value {
    let r = &lab.repo;
    json!({
        "batteries": r.batteries.values().map(|b| json!({ "id": b.value.id, "name": b.value.name, "mass_g": b.value.mass_g, "cells": b.value.cells, "capacity_mah": b.value.capacity_mah, "chemistry": b.value.chemistry })).collect::<Vec<_>>(),
        "motors": r.motors.values().map(|m| json!({ "id": m.value.id, "name": m.value.name, "mass_g": m.value.mass_g, "kv_rpm_per_v": m.value.kv_rpm_per_v })).collect::<Vec<_>>(),
        "props": r.props.values().map(|p| json!({ "id": p.value.id, "name": p.value.name, "mass_g": p.value.mass_g, "diameter_mm": p.value.diameter_mm, "pitch_in": p.value.pitch_in, "blades": p.value.blades })).collect::<Vec<_>>(),
        "frames": r.frames.values().map(|f| json!({ "id": f.value.id, "name": f.value.name, "mass_g": f.value.mass_g, "wheelbase_mm": f.value.wheelbase_mm })).collect::<Vec<_>>(),
    })
}

pub fn preview(lab: &Lab, params: &Value) -> anyhow::Result<Value> {
    let id = params["airframe"].as_str().unwrap_or("palm_x4_2in");
    let base = lab
        .repo
        .airframes
        .get(id)
        .with_context(|| format!("unknown airframe `{id}`"))?;
    let mut af = base.value.clone();
    for (key, slot) in [
        ("battery", &mut af.battery),
        ("motor", &mut af.motor),
        ("prop", &mut af.prop),
        ("frame", &mut af.frame),
    ] {
        if let Some(v) = params[key].as_str() {
            *slot = v.to_owned();
        }
    }
    let r = drone_schema::resolve::resolve_with(&lab.repo, &af)?;
    let baseline = drone_schema::resolve::resolve_with(&lab.repo, &base.value)?;
    let m = &r.model;
    let max_rotor_current = drone_sim::propulsion::steady_state_current(
        &m.motor,
        drone_sim::propulsion::torque_constant(&m.prop, 1.225),
        m.derived.max_omega_rad_s,
    );
    let mut warnings = Vec::new();
    if m.mass_kg > 0.25 {
        warnings.push(format!(
            "take-off mass {:.0} g exceeds 250 g",
            m.mass_kg * 1000.0
        ));
    }
    if m.derived.thrust_to_weight < 2.5 {
        warnings.push(format!(
            "thrust-to-weight {:.2} is low",
            m.derived.thrust_to_weight
        ));
    }
    if max_rotor_current > m.motor.max_current_a {
        warnings.push(format!(
            "full-throttle current {max_rotor_current:.1} A exceeds the motor rating"
        ));
    }
    Ok(json!({
        "selection": { "battery": af.battery, "motor": af.motor, "prop": af.prop, "frame": af.frame },
        "mass_g": (m.mass_kg * 10_000.0).round() / 10.0,
        "baseline_mass_g": (baseline.model.mass_kg * 10_000.0).round() / 10.0,
        "center_of_mass_m": m.center_of_mass_m,
        "performance": m.derived,
        "baseline_performance": baseline.model.derived,
        "full_throttle_current_a": (max_rotor_current * 4.0 * 10.0).round() / 10.0,
        "warnings": warnings,
        "simulated_firmware_matches": af.battery == base.value.battery && af.motor == base.value.motor && af.prop == base.value.prop && af.frame == base.value.frame,
    }))
}
