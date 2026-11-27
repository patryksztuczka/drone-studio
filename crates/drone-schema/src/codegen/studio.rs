use serde_json::{Value, json};

use crate::manifest::SensorType;
use crate::resolve::{Resolved, round_sig};

fn r(v: f64) -> f64 {
    round_sig(v)
}

pub fn board_layout(res: &Resolved<'_>) -> String {
    let b = res.board;
    let m = &res.model;
    let a = res.airframe;
    let devices: Vec<Value> = b
        .devices
        .iter()
        .map(|d| {
            let is_imu = d.component == res.imu.id;
            let size = if is_imu { [3.0, 2.5] } else { [2.0, 2.0] };
            let sensor_type = if is_imu {
                SensorType::Imu
            } else {
                SensorType::Barometer
            };
            let name = if is_imu {
                res.imu.name.clone()
            } else {
                res.baro.name.clone()
            };
            let identity = if is_imu {
                &res.imu.identity
            } else {
                &res.baro.identity
            };
            json!({
                "id": d.id,
                "component": d.component,
                "name": name,
                "type": sensor_type,
                "bus": d.bus,
                "chip_select": d.chip_select,
                "interrupt": d.interrupt,
                "address": d.address,
                "orientation": d.orientation,
                "position_mm": [d.position_mm[0], d.position_mm[1]],
                "size_mm": size,
                "identity": { "register": identity.register, "value": identity.value },
            })
        })
        .collect();
    let buses: Vec<Value> = b
        .buses
        .iter()
        .map(|bus| {
            let attached: Vec<&str> = b
                .devices
                .iter()
                .filter(|d| d.bus == bus.id)
                .map(|d| d.id.as_str())
                .collect();
            let pins: Vec<Value> = bus
                .pins
                .iter()
                .map(|(role, pin)| json!({ "role": role, "pin": pin }))
                .collect();
            json!({
                "id": bus.id,
                "kind": bus.kind,
                "peripheral": bus.peripheral,
                "frequency_hz": bus.frequency_hz,
                "pins": pins,
                "devices": attached,
            })
        })
        .collect();
    let rotors: Vec<Value> = m
        .rotors
        .iter()
        .map(|rot| {
            let output = a
                .rotors
                .iter()
                .find(|x| x.id == rot.id)
                .map(|x| x.output.clone());
            let pin = output
                .as_ref()
                .and_then(|o| b.motor_outputs.iter().find(|mo| &mo.id == o))
                .map(|mo| json!({ "timer": mo.timer, "channel": mo.channel, "pin": mo.pin }));
            json!({
                "id": rot.id,
                "position_m": rot.position_m,
                "spin": rot.spin,
                "output": pin,
            })
        })
        .collect();
    let com = m.center_of_mass_m;
    let components: Vec<Value> = res
        .masses
        .iter()
        .map(|item| {
            json!({
                "id": item.id,
                "mass_g": r(item.mass_kg * 1000.0),
                "position_m": [r(item.position_m.x - com[0]), r(item.position_m.y - com[1]), r(item.position_m.z - com[2])],
                "size_m": [r(item.size_m.x), r(item.size_m.y), r(item.size_m.z)],
            })
        })
        .collect();
    let mount = a.board_mount.position_mm;
    let hotspot = |id: &str, label: &str, kind: &str, p: [f64; 3]| json!({ "id": id, "label": label, "kind": kind, "position_m": [r(p[0] - com[0]), r(p[1] - com[1]), r(p[2] - com[2])] });
    let mm = |v: [f64; 3]| [v[0] / 1000.0, v[1] / 1000.0, v[2] / 1000.0];
    let mut hotspots = vec![
        hotspot("fc", "Flight controller", "board", mm(mount)),
        hotspot(
            "imu0",
            &res.imu.name,
            "imu",
            mm([
                mount[0] + res.imu_device.position_mm[0],
                mount[1] + res.imu_device.position_mm[1],
                mount[2] - res.imu_device.position_mm[2],
            ]),
        ),
        hotspot(
            "baro0",
            &res.baro.name,
            "barometer",
            mm([
                mount[0] + res.baro_device.position_mm[0],
                mount[1] + res.baro_device.position_mm[1],
                mount[2] - res.baro_device.position_mm[2],
            ]),
        ),
    ];
    if let Some(bat) = a.components.iter().find(|c| c.id == "battery") {
        hotspots.push(hotspot(
            "battery",
            &res.battery.name,
            "battery",
            mm(bat.position_mm),
        ));
    }
    for rot in &a.rotors {
        hotspots.push(hotspot(
            &rot.id,
            &format!("Motor {}", rot.id.to_ascii_uppercase()),
            "motor",
            mm(rot.position_mm),
        ));
    }
    let doc = json!({
        "format_version": 1,
        "generated": super::GENERATED_MARKER,
        "source_hash": m.source_hash,
        "airframe": {
            "id": a.id,
            "name": a.name,
            "description": a.description,
            "mass_g": r(m.mass_kg * 1000.0),
            "wheelbase_mm": res.frame.wheelbase_mm,
            "frame_size_m": [res.frame.size_mm[0] / 1000.0, res.frame.size_mm[1] / 1000.0, res.frame.size_mm[2] / 1000.0],
            "prop_diameter_m": m.prop.diameter_m,
            "center_of_mass_m": com,
            "rotors": rotors,
            "components": components,
            "hotspots": hotspots,
            "colors": a.visual.colors,
            "components_selected": {
                "frame": res.frame.id,
                "battery": res.battery.id,
                "motor": res.motor.id,
                "prop": res.prop.id,
            },
        },
        "performance": m.derived,
        "board": {
            "id": b.id,
            "name": b.name,
            "size_mm": b.size_mm,
            "thickness_mm": b.thickness_mm,
            "mounting_holes_mm": b.mounting_holes_mm,
            "mcu": {
                "id": res.mcu.id,
                "name": res.mcu.name,
                "core": res.mcu.core,
                "clock_hz": res.mcu.clock_hz,
                "position_mm": [0.0, 0.0],
                "size_mm": [14.0, 14.0],
            },
            "buses": buses,
            "devices": devices,
            "motor_outputs": b.motor_outputs,
            "analog": b.analog,
            "leds": b.leds,
            "pads": b.pads,
        },
    });
    let mut s = serde_json::to_string_pretty(&doc).unwrap_or_default();
    s.push('\n');
    s
}
