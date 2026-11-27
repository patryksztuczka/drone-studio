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

fn gpio_port(pin: &str) -> Option<(char, u8)> {
    let mut chars = pin.chars();
    if chars.next() != Some('P') {
        return None;
    }
    let port = chars.next().filter(char::is_ascii_uppercase)?;
    let number = chars.as_str().parse().ok()?;
    Some((port, number))
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
    for p in &r.mcu.renode.peripherals {
        let _ = writeln!(
            out,
            "{}: {} @ {{\n        sysbus 0x{:08X};\n        rcc RegistrationPeripheralAlias.{}\n    }}\n",
            p.name, p.model, p.address, p.rcc
        );
    }
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
                if let Some((port, number)) = dev.chip_select.as_deref().and_then(gpio_port) {
                    let _ = writeln!(out, "\ngpioPort{port}:\n    {number} -> {}@0", dev.id);
                }
                let _ = writeln!(out);
            }
            BusKind::I2c => {
                let addr = dev.address.unwrap_or(0);
                let _ = writeln!(
                    out,
                    "{}: {model} @ {} 0x{addr:02x}\n",
                    dev.id, bus.peripheral
                );
            }
            _ => {}
        }
    }
    while out.ends_with("\n\n") {
        out.pop();
    }
    out
}

#[cfg(test)]
mod tests {
    use super::gpio_port;

    #[test]
    fn parses_stm32_pin_names() {
        assert_eq!(gpio_port("PC15"), Some(('C', 15)));
        assert_eq!(gpio_port("PA0"), Some(('A', 0)));
        assert_eq!(gpio_port("C15"), None);
        assert_eq!(gpio_port("Pc1"), None);
    }
}
