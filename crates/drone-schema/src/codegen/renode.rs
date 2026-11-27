use std::fmt::Write;

use super::GENERATED_MARKER;
use crate::manifest::{BusKind, SensorType};
use crate::resolve::Resolved;

fn renode_name(component: &str) -> Option<&'static str> {
    match component {
        "icm42688p" => Some("Sensors.ICM42688P"),
        _ => None,
    }
}

pub fn platform(r: &Resolved<'_>) -> String {
    let board = r.board;
    let mut out = String::new();
    let _ = writeln!(out, "// {GENERATED_MARKER}");
    let _ = writeln!(
        out,
        "// board: hardware/boards/{}.yaml, mcu: {}\n",
        board.id, r.mcu.id
    );
    let _ = writeln!(out, "using \"{}\"\n", r.mcu.renode.platform);
    for dev in &board.devices {
        let Some(bus) = board.buses.iter().find(|b| b.id == dev.bus) else {
            continue;
        };
        let Some(model) = renode_name(&dev.component) else {
            continue;
        };
        let is_imu = r.imu.id == dev.component && r.imu.sensor_type == SensorType::Imu;
        match bus.kind {
            BusKind::Spi if is_imu => {
                let _ = writeln!(out, "{}: {model} @ {}", dev.id, bus.peripheral);
            }
            BusKind::I2c => {
                let addr = dev.address.unwrap_or(0);
                let _ = writeln!(out, "{}: {model} @ {} 0x{addr:02x}", dev.id, bus.peripheral);
            }
            _ => {}
        }
    }
    out
}
