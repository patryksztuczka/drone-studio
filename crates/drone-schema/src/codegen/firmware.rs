use std::fmt::Write;

use super::{GENERATED_MARKER, f32_literal};
use crate::manifest::{Board, BusKind, Device};
use crate::resolve::Resolved;

fn upper(s: &str) -> String {
    s.to_ascii_uppercase()
}

fn mat3(m: &[[f64; 3]; 3]) -> String {
    let rows: Vec<String> = m
        .iter()
        .map(|r| {
            format!(
                "[{}, {}, {}]",
                f32_literal(r[0]),
                f32_literal(r[1]),
                f32_literal(r[2])
            )
        })
        .collect();
    format!("[{}]", rows.join(", "))
}

fn vec3(v: &[f64; 3]) -> String {
    format!(
        "[{}, {}, {}]",
        f32_literal(v[0]),
        f32_literal(v[1]),
        f32_literal(v[2])
    )
}

pub fn mixer(r: &Resolved<'_>) -> Vec<[f64; 3]> {
    let rotors = &r.airframe.rotors;
    let n = rotors.len().max(1) as f64;
    let cx = rotors.iter().map(|m| m.position_mm[0]).sum::<f64>() / n;
    let cy = rotors.iter().map(|m| m.position_mm[1]).sum::<f64>() / n;
    let max_x = rotors
        .iter()
        .map(|m| (m.position_mm[0] - cx).abs())
        .fold(0.0, f64::max);
    let max_y = rotors
        .iter()
        .map(|m| (m.position_mm[1] - cy).abs())
        .fold(0.0, f64::max);
    rotors
        .iter()
        .map(|m| {
            let round = |v: f64| (v * 1e4).round() / 1e4;
            [
                round(-(m.position_mm[1] - cy) / max_y),
                round((m.position_mm[0] - cx) / max_x),
                -m.spin.sign(),
            ]
        })
        .collect()
}

fn device_of<'a>(board: &'a Board, id: &str) -> Option<&'a Device> {
    board.devices.iter().find(|d| d.id == id)
}

fn pin_macros(r: &Resolved<'_>, out: &mut String) {
    let board = r.board;
    let imu = r.imu_device;
    let Some(spi) = board
        .buses
        .iter()
        .find(|b| b.id == imu.bus && b.kind == BusKind::Spi)
    else {
        return;
    };
    let pin = |role: &str| spi.pins.get(role).cloned().unwrap_or_default();
    let _ = writeln!(out, "#[macro_export]");
    let _ = writeln!(out, "macro_rules! {}_imu_spi {{", board.id);
    let _ = writeln!(
        out,
        "    ($p:ident) => {{\n        ($p.{}, $p.{}, $p.{}, $p.{}, $p.{})\n    }};",
        upper(&spi.peripheral),
        pin("sck"),
        pin("mosi"),
        pin("miso"),
        imu.chip_select.clone().unwrap_or_default()
    );
    let _ = writeln!(out, "}}\n");

    let mut timers: Vec<&str> = board
        .motor_outputs
        .iter()
        .map(|m| m.timer.as_str())
        .collect();
    timers.dedup();
    for (n, timer) in timers.iter().enumerate() {
        let outputs: Vec<_> = board
            .motor_outputs
            .iter()
            .filter(|m| m.timer == *timer)
            .collect();
        let pins: Vec<String> = outputs.iter().map(|m| format!("$p.{}", m.pin)).collect();
        let _ = writeln!(out, "#[macro_export]");
        let _ = writeln!(out, "macro_rules! {}_motor_timer_{n} {{", board.id);
        let _ = writeln!(
            out,
            "    ($p:ident) => {{\n        ($p.{}, {})\n    }};",
            upper(timer),
            pins.join(", ")
        );
        let _ = writeln!(out, "}}\n");
    }
    if let Some(led) = board.leds.first() {
        let _ = writeln!(out, "#[macro_export]");
        let _ = writeln!(out, "macro_rules! {}_status_led {{", board.id);
        let _ = writeln!(out, "    ($p:ident) => {{\n        $p.{}\n    }};", led.pin);
        let _ = writeln!(out, "}}\n");
    }
    let _ = writeln!(out, "#[macro_export]");
    let _ = writeln!(out, "macro_rules! {}_telemetry_uart {{", board.id);
    if let Some(uart) = board.buses.iter().find(|b| b.id == "telemetry") {
        let p = |role: &str| uart.pins.get(role).cloned().unwrap_or_default();
        let _ = writeln!(
            out,
            "    ($p:ident) => {{\n        ($p.{}, $p.{}, $p.{})\n    }};",
            upper(&uart.peripheral),
            p("rx"),
            p("tx")
        );
    }
    let _ = writeln!(out, "}}");
}

pub fn constants(r: &Resolved<'_>) -> String {
    let m = &r.model;
    let board = r.board;
    let a = r.airframe;
    let full = f64::from((1u32 << board.analog.adc_bits) - 1);
    let vref = board.analog.adc_reference_v;
    let vbat_per_count = vref / full * board.analog.vbat.divider_ratio;
    let amps_per_count = vref / full / (board.analog.current.scale_mv_per_a / 1000.0);
    let offset_counts = board.analog.current.offset_mv / 1000.0 / vref * full;
    let body_from_sensor = crate::resolve::body_from_sensor(a.board_mount.yaw_deg, r.imu_device);
    let baro_addr = device_of(board, &r.baro_device.id)
        .and_then(|d| d.address)
        .unwrap_or(0);
    let mix = mixer(r);
    let rows: Vec<String> = mix
        .iter()
        .map(|row| {
            format!(
                "[{}, {}, {}]",
                f32_literal(row[0]),
                f32_literal(row[1]),
                f32_literal(row[2])
            )
        })
        .collect();
    let ids: Vec<String> = m.rotors.iter().map(|r| format!("\"{}\"", r.id)).collect();
    let inertia = [
        m.inertia_kg_m2[0][0],
        m.inertia_kg_m2[1][1],
        m.inertia_kg_m2[2][2],
    ];
    let imu_spi = board.buses.iter().find(|b| b.id == r.imu_device.bus);

    let mut out = String::new();
    let _ = writeln!(out, "// {GENERATED_MARKER}");
    let _ = writeln!(
        out,
        "// source: hardware/airframes/{}/airframe.yaml (hash {})\n",
        a.id, m.source_hash
    );
    let _ = writeln!(out, "use crate::{{AirframeConstants, BoardPins}};\n");
    let _ = writeln!(
        out,
        "pub const AIRFRAME: AirframeConstants = AirframeConstants {{"
    );
    let _ = writeln!(out, "    id: \"{}\",", a.id);
    let _ = writeln!(out, "    source_hash: \"{}\",", m.source_hash);
    let _ = writeln!(out, "    board: \"{}\",", board.id);
    let _ = writeln!(out, "    mcu: \"{}\",", r.mcu.id);
    let _ = writeln!(out, "    physics_hz: {},", m.rates.physics_hz);
    let _ = writeln!(out, "    control_hz: {},", m.rates.control_hz);
    let _ = writeln!(out, "    telemetry_hz: {},", m.rates.telemetry_hz);
    let _ = writeln!(out, "    rotor_ids: [{}],", ids.join(", "));
    let _ = writeln!(out, "    mixer: [{}],", rows.join(", "));
    let _ = writeln!(
        out,
        "    imu_body_from_sensor: {},",
        mat3(&body_from_sensor.m)
    );
    let _ = writeln!(
        out,
        "    gyro_lsb_per_dps: {},",
        f32_literal(m.imu.gyro_lsb_per_dps)
    );
    let _ = writeln!(
        out,
        "    accel_lsb_per_g: {},",
        f32_literal(m.imu.accel_lsb_per_g)
    );
    let _ = writeln!(out, "    imu_odr_hz: {},", f32_literal(m.imu.odr_hz));
    let _ = writeln!(
        out,
        "    imu_who_am_i_register: 0x{:02x},",
        r.imu.identity.register
    );
    let _ = writeln!(out, "    imu_who_am_i: 0x{:02x},", r.imu.identity.value);
    let _ = writeln!(
        out,
        "    imu_spi_hz: {},",
        imu_spi.map_or(0, |b| b.frequency_hz)
    );
    let _ = writeln!(out, "    baro_i2c_address: 0x{baro_addr:02x},");
    let _ = writeln!(
        out,
        "    baro_chip_id_register: 0x{:02x},",
        r.baro.identity.register
    );
    let _ = writeln!(out, "    baro_chip_id: 0x{:02x},", r.baro.identity.value);
    let _ = writeln!(
        out,
        "    vbat_volts_per_count: {},",
        f32_literal(vbat_per_count)
    );
    let _ = writeln!(
        out,
        "    current_amps_per_count: {},",
        f32_literal(amps_per_count)
    );
    let _ = writeln!(
        out,
        "    current_offset_counts: {},",
        f32_literal(offset_counts)
    );
    let _ = writeln!(out, "    battery_cells: {},", r.battery.cells);
    let _ = writeln!(
        out,
        "    battery_capacity_mah: {},",
        f32_literal(r.battery.capacity_mah)
    );
    let _ = writeln!(
        out,
        "    cell_full_v: {},",
        f32_literal(r.battery.cell_voltage.full)
    );
    let _ = writeln!(
        out,
        "    cell_warning_v: {},",
        f32_literal(a.limits.battery_warning_cell_v)
    );
    let _ = writeln!(
        out,
        "    cell_critical_v: {},",
        f32_literal(a.limits.battery_critical_cell_v)
    );
    let _ = writeln!(
        out,
        "    cell_empty_v: {},",
        f32_literal(r.battery.cell_voltage.empty)
    );
    let _ = writeln!(
        out,
        "    max_tilt_deg: {},",
        f32_literal(a.limits.max_tilt_deg)
    );
    let _ = writeln!(out, "    max_rate_dps: {},", vec3(&a.limits.max_rate_dps));
    let _ = writeln!(
        out,
        "    max_climb_mps: {},",
        f32_literal(a.limits.max_climb_mps)
    );
    let _ = writeln!(out, "    mass_kg: {},", f32_literal(m.mass_kg));
    let _ = writeln!(out, "    inertia_diag_kg_m2: {},", vec3(&inertia));
    let _ = writeln!(
        out,
        "    hover_thrust_fraction: {},",
        f32_literal(m.derived.hover_thrust_fraction)
    );
    let _ = writeln!(
        out,
        "    max_thrust_per_rotor_n: {},",
        f32_literal(m.derived.max_thrust_per_rotor_n)
    );
    let _ = writeln!(
        out,
        "    motor_pwm_hz: {},",
        board.motor_protocol.frequency_hz
    );
    let _ = writeln!(out, "}};\n");

    let _ = writeln!(out, "pub const PINS: BoardPins = BoardPins {{");
    let spi_pin = |role: &str| {
        imu_spi
            .and_then(|b| b.pins.get(role))
            .cloned()
            .unwrap_or_default()
    };
    let _ = writeln!(
        out,
        "    imu_spi: \"{}\",",
        imu_spi.map_or(String::new(), |b| b.peripheral.clone())
    );
    let _ = writeln!(out, "    imu_sck: \"{}\",", spi_pin("sck"));
    let _ = writeln!(out, "    imu_miso: \"{}\",", spi_pin("miso"));
    let _ = writeln!(out, "    imu_mosi: \"{}\",", spi_pin("mosi"));
    let _ = writeln!(
        out,
        "    imu_cs: \"{}\",",
        r.imu_device.chip_select.clone().unwrap_or_default()
    );
    let _ = writeln!(
        out,
        "    imu_int: \"{}\",",
        r.imu_device.interrupt.clone().unwrap_or_default()
    );
    let baro_bus = board.buses.iter().find(|b| b.id == r.baro_device.bus);
    let _ = writeln!(
        out,
        "    baro_i2c: \"{}\",",
        baro_bus.map_or(String::new(), |b| b.peripheral.clone())
    );
    let motor_pins: Vec<String> = board
        .motor_outputs
        .iter()
        .map(|m| format!("\"{}\"", m.pin))
        .collect();
    let motor_timers: Vec<String> = board
        .motor_outputs
        .iter()
        .map(|m| format!("(\"{}\", {})", m.timer, m.channel))
        .collect();
    let _ = writeln!(out, "    motor_pins: [{}],", motor_pins.join(", "));
    let _ = writeln!(
        out,
        "    motor_timer_channels: [{}],",
        motor_timers.join(", ")
    );
    let _ = writeln!(out, "    vbat_pin: \"{}\",", board.analog.vbat.pin);
    let _ = writeln!(out, "    current_pin: \"{}\",", board.analog.current.pin);
    let _ = writeln!(out, "}};\n");
    pin_macros(r, &mut out);
    out
}

pub fn index(modules: &[String]) -> String {
    let mut out = String::new();
    let _ = writeln!(out, "// {GENERATED_MARKER}\n");
    for m in modules {
        let _ = writeln!(out, "pub mod {m};");
    }
    out
}
