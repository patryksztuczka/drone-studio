use std::collections::{BTreeMap, BTreeSet};

use crate::diagnostics::Diagnostics;
use crate::load::{Located, Repository};
use crate::manifest::{AssertionKind, Board, BusKind, FaultKind, Scenario};
use crate::resolve::resolve_with;

const MAX_TAKEOFF_MASS_KG: f64 = 0.250;

fn duplicates<'a>(ids: impl IntoIterator<Item = &'a str>) -> Vec<&'a str> {
    let mut seen = BTreeSet::new();
    let mut dup = Vec::new();
    for id in ids {
        if !seen.insert(id) {
            dup.push(id);
        }
    }
    dup
}

fn report_duplicates<'a>(
    d: &mut Diagnostics,
    file: &str,
    path: &str,
    what: &str,
    ids: impl IntoIterator<Item = &'a str>,
) {
    for id in duplicates(ids) {
        d.error(
            "ref.duplicate",
            file,
            path,
            format!("duplicate {what} id `{id}`"),
        );
    }
}

fn check_board(repo: &Repository, b: &Located<Board>, d: &mut Diagnostics) {
    let f = &b.file;
    let board = &b.value;
    report_duplicates(
        d,
        f,
        "/buses",
        "bus",
        board.buses.iter().map(|x| x.id.as_str()),
    );
    report_duplicates(
        d,
        f,
        "/devices",
        "device",
        board.devices.iter().map(|x| x.id.as_str()),
    );
    report_duplicates(
        d,
        f,
        "/motor_outputs",
        "motor output",
        board.motor_outputs.iter().map(|x| x.id.as_str()),
    );
    report_duplicates(
        d,
        f,
        "/pads",
        "pad",
        board.pads.iter().map(|x| x.id.as_str()),
    );
    report_duplicates(
        d,
        f,
        "/leds",
        "led",
        board.leds.iter().map(|x| x.id.as_str()),
    );

    let Some(mcu) = repo.mcus.get(&board.mcu).map(|m| &m.value) else {
        d.error(
            "ref.missing",
            f,
            "/mcu",
            format!("unknown mcu `{}`", board.mcu),
        );
        return;
    };

    let mut assignments: Vec<(String, String)> = Vec::new();

    for (i, bus) in board.buses.iter().enumerate() {
        let path = format!("/buses/{i}");
        let available = match bus.kind {
            BusKind::Spi => &mcu.peripherals.spi,
            BusKind::I2c => &mcu.peripherals.i2c,
            BusKind::Uart => &mcu.peripherals.uart,
        };
        if !available.contains(&bus.peripheral) {
            d.error(
                "ref.peripheral",
                f,
                &format!("{path}/peripheral"),
                format!(
                    "mcu `{}` has no {} peripheral `{}`",
                    mcu.id,
                    bus.kind.as_str(),
                    bus.peripheral
                ),
            );
        }
        let required: &[&str] = match bus.kind {
            BusKind::Spi => &["sck", "miso", "mosi"],
            BusKind::I2c => &["scl", "sda"],
            BusKind::Uart => &["tx", "rx"],
        };
        for r in required {
            if !bus.pins.contains_key(*r) {
                d.error(
                    "bus.pins",
                    f,
                    &format!("{path}/pins"),
                    format!("{} bus `{}` needs pin `{r}`", bus.kind.as_str(), bus.id),
                );
            }
        }
        for (role, pin) in &bus.pins {
            if !required.contains(&role.as_str()) {
                d.error(
                    "bus.pins",
                    f,
                    &format!("{path}/pins/{role}"),
                    format!(
                        "pin role `{role}` does not belong on a {} bus",
                        bus.kind.as_str()
                    ),
                );
            }
            assignments.push((pin.clone(), format!("{}.{role}", bus.id)));
        }
    }
    report_duplicates(
        d,
        f,
        "/buses",
        "bus peripheral",
        board.buses.iter().map(|x| x.peripheral.as_str()),
    );

    for (i, dev) in board.devices.iter().enumerate() {
        let path = format!("/devices/{i}");
        let Some(sensor) = repo.sensors.get(&dev.component).map(|s| &s.value) else {
            d.error(
                "ref.missing",
                f,
                &format!("{path}/component"),
                format!("unknown sensor `{}`", dev.component),
            );
            continue;
        };
        match board.buses.iter().find(|b| b.id == dev.bus) {
            None => d.error(
                "ref.missing",
                f,
                &format!("{path}/bus"),
                format!("unknown bus `{}`", dev.bus),
            ),
            Some(bus) if bus.kind != sensor.interface => d.error(
                "ref.bus_kind",
                f,
                &format!("{path}/bus"),
                format!(
                    "`{}` talks {} but bus `{}` is {}",
                    sensor.id,
                    sensor.interface.as_str(),
                    bus.id,
                    bus.kind.as_str()
                ),
            ),
            Some(_) => {}
        }
        if sensor.interface == BusKind::Spi && dev.chip_select.is_none() {
            d.error(
                "device.chip_select",
                f,
                &path,
                format!("SPI device `{}` needs a chip_select pin", dev.id),
            );
        }
        if sensor.interface == BusKind::I2c && dev.address.is_none() {
            d.error(
                "device.address",
                f,
                &path,
                format!("I2C device `{}` needs an address", dev.id),
            );
        }
        if let (Some(addr), Some(baro)) = (dev.address, &sensor.barometer)
            && addr != baro.i2c_address
            && addr != baro.i2c_address + 1
        {
            d.error(
                "device.address",
                f,
                &format!("{path}/address"),
                format!(
                    "`{}` answers on 0x{:02x} or 0x{:02x}, not 0x{addr:02x}",
                    sensor.id,
                    baro.i2c_address,
                    baro.i2c_address + 1
                ),
            );
        }
        if sensor.imu.is_some() && dev.orientation.is_none() {
            d.error(
                "device.orientation",
                f,
                &path,
                format!("IMU `{}` needs an orientation", dev.id),
            );
        }
        if let Some(cs) = &dev.chip_select {
            assignments.push((cs.clone(), format!("{}.cs", dev.id)));
        }
        if let Some(int) = &dev.interrupt {
            assignments.push((int.clone(), format!("{}.int", dev.id)));
        }
    }
    let mut i2c_addresses: BTreeSet<(String, u8)> = BTreeSet::new();
    for (i, dev) in board.devices.iter().enumerate() {
        if let Some(a) = dev.address
            && !i2c_addresses.insert((dev.bus.clone(), a))
        {
            d.error(
                "device.address",
                f,
                &format!("/devices/{i}/address"),
                format!("address 0x{a:02x} is already used on bus `{}`", dev.bus),
            );
        }
    }

    let mut channels = BTreeSet::new();
    for (i, m) in board.motor_outputs.iter().enumerate() {
        if !mcu.peripherals.timers.contains(&m.timer) {
            d.error(
                "ref.peripheral",
                f,
                &format!("/motor_outputs/{i}/timer"),
                format!("mcu `{}` has no timer `{}`", mcu.id, m.timer),
            );
        }
        if !channels.insert((m.timer.clone(), m.channel)) {
            d.error(
                "ref.duplicate",
                f,
                &format!("/motor_outputs/{i}"),
                format!("{} channel {} is used twice", m.timer, m.channel),
            );
        }
        assignments.push((m.pin.clone(), format!("{}.pwm", m.id)));
    }
    for (name, adc) in [
        ("vbat", &board.analog.vbat.adc),
        ("current", &board.analog.current.adc),
    ] {
        if !mcu.peripherals.adc.contains(adc) {
            d.error(
                "ref.peripheral",
                f,
                &format!("/analog/{name}/adc"),
                format!("mcu `{}` has no adc `{adc}`", mcu.id),
            );
        }
    }
    assignments.push((board.analog.vbat.pin.clone(), "vbat".into()));
    assignments.push((board.analog.current.pin.clone(), "current".into()));
    for l in &board.leds {
        assignments.push((l.pin.clone(), format!("led.{}", l.id)));
    }
    let mut by_pin: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for (pin, owner) in assignments {
        by_pin.entry(pin).or_default().push(owner);
    }
    for (pin, owners) in by_pin {
        if owners.len() > 1 {
            d.error(
                "pin.conflict",
                f,
                "",
                format!("pin {pin} is assigned to {}", owners.join(", ")),
            );
        }
    }
    let (hw, hh) = (board.size_mm[0] / 2.0 + 1.0, board.size_mm[1] / 2.0 + 1.0);
    for (i, p) in board.pads.iter().enumerate() {
        if p.x_mm.abs() > hw || p.y_mm.abs() > hh {
            d.error(
                "pad.outside",
                f,
                &format!("/pads/{i}"),
                format!(
                    "pad `{}` lies outside the {}x{} mm board",
                    p.id, board.size_mm[0], board.size_mm[1]
                ),
            );
        }
    }
}

fn check_battery(file: &str, b: &crate::manifest::Battery, d: &mut Diagnostics) {
    let cv = &b.cell_voltage;
    if !(cv.full > cv.nominal && cv.nominal > cv.empty) {
        d.error(
            "battery.voltage",
            file,
            "/cell_voltage",
            "cell voltages must satisfy full > nominal > empty",
        );
    }
    let curve = &b.ocv_curve;
    if curve
        .windows(2)
        .any(|w| w[1][0] <= w[0][0] || w[1][1] < w[0][1])
    {
        d.error(
            "battery.ocv",
            file,
            "/ocv_curve",
            "OCV curve must be sorted by SoC and non-decreasing in voltage",
        );
    }
    if let (Some(first), Some(last)) = (curve.first(), curve.last())
        && (first[0] != 0.0 || last[0] != 1.0)
    {
        d.error(
            "battery.ocv",
            file,
            "/ocv_curve",
            "OCV curve must span SoC 0.0 to 1.0",
        );
    }
}

fn check_airframes(repo: &Repository, d: &mut Diagnostics) {
    for a in repo.airframes.values() {
        let f = &a.file;
        let af = &a.value;
        let refs: [(&str, &str, bool); 5] = [
            ("frame", &af.frame, repo.frames.contains_key(&af.frame)),
            ("board", &af.board, repo.boards.contains_key(&af.board)),
            (
                "battery",
                &af.battery,
                repo.batteries.contains_key(&af.battery),
            ),
            ("motor", &af.motor, repo.motors.contains_key(&af.motor)),
            ("prop", &af.prop, repo.props.contains_key(&af.prop)),
        ];
        let mut ok = true;
        for (kind, id, exists) in refs {
            if !exists {
                ok = false;
                d.error(
                    "ref.missing",
                    f,
                    &format!("/{kind}"),
                    format!("unknown {kind} `{id}`"),
                );
            }
        }
        report_duplicates(
            d,
            f,
            "/rotors",
            "rotor",
            af.rotors.iter().map(|r| r.id.as_str()),
        );
        report_duplicates(
            d,
            f,
            "/rotors",
            "rotor output",
            af.rotors.iter().map(|r| r.output.as_str()),
        );
        report_duplicates(
            d,
            f,
            "/components",
            "component",
            af.components.iter().map(|c| c.id.as_str()),
        );
        if let Some(board) = repo.boards.get(&af.board) {
            for (i, r) in af.rotors.iter().enumerate() {
                if !board.value.motor_outputs.iter().any(|m| m.id == r.output) {
                    d.error(
                        "ref.missing",
                        f,
                        &format!("/rotors/{i}/output"),
                        format!(
                            "board `{}` has no motor output `{}`",
                            board.value.id, r.output
                        ),
                    );
                }
            }
        }
        let cw = af
            .rotors
            .iter()
            .filter(|r| r.spin == drone_sim::model::Spin::Cw)
            .count();
        if cw * 2 != af.rotors.len() {
            d.error(
                "airframe.spin",
                f,
                "/rotors",
                "a quad needs two CW and two CCW rotors or yaw cannot be controlled",
            );
        }
        for r in &af.rotors {
            let opposite = af.rotors.iter().find(|o| {
                (o.position_mm[0] + r.position_mm[0]).abs() < 0.5
                    && (o.position_mm[1] + r.position_mm[1]).abs() < 0.5
            });
            match opposite {
                None => d.error(
                    "airframe.geometry",
                    f,
                    "/rotors",
                    format!(
                        "rotor `{}` has no diagonal partner; quad_x needs symmetric rotors",
                        r.id
                    ),
                ),
                Some(o) if o.spin != r.spin => d.error(
                    "airframe.spin",
                    f,
                    "/rotors",
                    format!(
                        "diagonal rotors `{}` and `{}` must spin the same way",
                        r.id, o.id
                    ),
                ),
                Some(_) => {}
            }
        }
        if let Some(frame) = repo.frames.get(&af.frame) {
            let span = af
                .rotors
                .iter()
                .map(|r| r.position_mm[0].hypot(r.position_mm[1]) * 2.0)
                .fold(0.0, f64::max);
            if (span - frame.value.wheelbase_mm).abs() > 3.0 {
                d.error(
                    "airframe.geometry",
                    f,
                    "/rotors",
                    format!(
                        "rotor diagonal {span:.1} mm does not match frame wheelbase {} mm",
                        frame.value.wheelbase_mm
                    ),
                );
            }
        }
        if let Some(prop) = repo.props.get(&af.prop) {
            let r = prop.value.diameter_mm / 2.0;
            for (i, a1) in af.rotors.iter().enumerate() {
                for a2 in af.rotors.iter().skip(i + 1) {
                    let dist = (a1.position_mm[0] - a2.position_mm[0])
                        .hypot(a1.position_mm[1] - a2.position_mm[1]);
                    if dist < 2.0 * r {
                        d.error(
                            "airframe.geometry",
                            f,
                            "/rotors",
                            format!(
                                "props of `{}` and `{}` overlap ({dist:.1} mm apart, need {:.1})",
                                a1.id,
                                a2.id,
                                2.0 * r
                            ),
                        );
                    }
                }
            }
        }
        let rates = &af.loop_rates;
        if rates.physics_hz % rates.control_hz != 0 {
            d.error(
                "airframe.rates",
                f,
                "/loop_rates",
                "physics_hz must be a whole multiple of control_hz for lockstep",
            );
        }
        if af.limits.battery_critical_cell_v >= af.limits.battery_warning_cell_v {
            d.error(
                "airframe.limits",
                f,
                "/limits",
                "battery_critical_cell_v must be below battery_warning_cell_v",
            );
        }
        if !ok {
            continue;
        }
        match resolve_with(repo, af) {
            Err(e) => d.error("airframe.resolve", f, "", e.to_string()),
            Ok(r) => {
                let m = &r.model;
                if m.mass_kg > MAX_TAKEOFF_MASS_KG {
                    d.error(
                        "physics.mass",
                        f,
                        "",
                        format!(
                            "take-off mass {:.0} g exceeds the 250 g class limit",
                            m.mass_kg * 1000.0
                        ),
                    );
                }
                let twr = m.derived.thrust_to_weight;
                if twr < 1.5 {
                    d.error("physics.thrust", f, "", format!("thrust-to-weight {twr:.2} cannot hover with control margin (need >= 1.5)"));
                } else if twr < 2.5 {
                    d.warning(
                        "physics.thrust",
                        f,
                        "",
                        format!(
                            "thrust-to-weight {twr:.2} leaves little margin (recommend >= 2.5)"
                        ),
                    );
                }
                let full_current = drone_sim::propulsion::steady_state_current(
                    &m.motor,
                    drone_sim::propulsion::torque_constant(&m.prop, 1.225),
                    m.derived.max_omega_rad_s,
                );
                if full_current > m.motor.max_current_a {
                    d.warning("physics.current", f, "", format!("full-throttle current {full_current:.1} A exceeds motor rating {:.1} A", m.motor.max_current_a));
                }
                let pack_limit = r.battery.max_discharge_c * r.battery.capacity_mah / 1000.0;
                let total = full_current * af.rotors.len() as f64;
                if total > pack_limit {
                    d.warning("physics.battery", f, "", format!("full-throttle draw {total:.1} A exceeds the pack's {pack_limit:.1} A rating"));
                }
                let com = m.center_of_mass_m;
                let offset = com[0].hypot(com[1]);
                if offset > 0.005 {
                    d.warning(
                        "physics.balance",
                        f,
                        "",
                        format!(
                            "centre of mass sits {:.1} mm off the rotor centre",
                            offset * 1000.0
                        ),
                    );
                }
            }
        }
    }
}

fn check_scenario(repo: &Repository, file: &str, s: &Scenario, d: &mut Diagnostics) {
    let Some(airframe) = repo.airframes.get(&s.airframe) else {
        d.error(
            "ref.missing",
            file,
            "/airframe",
            format!("unknown airframe `{}`", s.airframe),
        );
        return;
    };
    for (i, fault) in s.faults.iter().enumerate() {
        let path = format!("/faults/{i}");
        if fault.t > s.duration_s {
            d.error(
                "scenario.time",
                file,
                &path,
                "fault starts after the scenario ends",
            );
        }
        if let Some(m) = &fault.motor
            && !airframe.value.rotors.iter().any(|r| &r.id == m)
        {
            d.error(
                "ref.missing",
                file,
                &format!("{path}/motor"),
                format!("airframe `{}` has no rotor `{m}`", airframe.value.id),
            );
        }
        if fault.kind == FaultKind::RcLoss && fault.duration_s.is_none() {
            d.warning(
                "scenario.fault",
                file,
                &path,
                "rc_loss without duration_s lasts until the end",
            );
        }
    }
    if s.pilot.windows(2).any(|w| w[1].t < w[0].t) {
        d.error(
            "scenario.pilot",
            file,
            "/pilot",
            "pilot keyframes must be sorted by t",
        );
    }
    for (i, k) in s.pilot.iter().enumerate() {
        if k.t > s.duration_s {
            d.error(
                "scenario.time",
                file,
                &format!("/pilot/{i}"),
                "keyframe is after the scenario ends",
            );
        }
    }
    for (i, a) in s.assertions.iter().enumerate() {
        let path = format!("/assertions/{i}");
        if let Some([t0, t1]) = a.window
            && (t1 <= t0 || t1 > s.duration_s + 1e-9)
        {
            d.error(
                "scenario.window",
                file,
                &format!("{path}/window"),
                format!(
                    "window [{t0}, {t1}] must be increasing and inside the {} s scenario",
                    s.duration_s
                ),
            );
        }
        let needs: &[(&str, bool)] = match a.kind {
            AssertionKind::AltitudeWithin => &[
                ("window", a.window.is_some()),
                ("min", a.min.is_some()),
                ("max", a.max.is_some()),
            ],
            AssertionKind::MaxTiltDeg
            | AssertionKind::AttitudeErrorRmsDeg
            | AssertionKind::MaxMotorSaturationPct
            | AssertionKind::HorizontalSpeedMaxMps => {
                &[("window", a.window.is_some()), ("max", a.max.is_some())]
            }
            AssertionKind::ArmedAt => &[("t", a.t.is_some())],
            AssertionKind::TouchdownSpeedMaxMps => &[("max", a.max.is_some())],
            AssertionKind::BatteryMinV => &[("min", a.min.is_some())],
            AssertionKind::FailsafeTriggered => &[("window", a.window.is_some())],
            AssertionKind::StepResponse => &[
                ("axis", a.axis.is_some()),
                ("t", a.t.is_some()),
                ("target_deg", a.target_deg.is_some()),
            ],
            AssertionKind::NoFailsafe | AssertionKind::DisarmedAtEnd => &[],
        };
        for (field, present) in needs {
            if !present {
                d.error(
                    "scenario.assertion",
                    file,
                    &path,
                    format!("{:?} assertion needs `{field}`", a.kind),
                );
            }
        }
    }
    for key in s.params.keys() {
        if !KNOWN_PARAM_PREFIXES.iter().any(|p| key.starts_with(p)) {
            d.warning(
                "scenario.params",
                file,
                &format!("/params/{key}"),
                format!("parameter `{key}` is not a known flight-core parameter group"),
            );
        }
    }
}

const KNOWN_PARAM_PREFIXES: [&str; 9] = [
    "rate.", "angle.", "alt.", "vel_z.", "gyro.", "dterm.", "ahrs.", "yaw.", "hover.",
];

pub fn check(repo: &Repository, d: &mut Diagnostics) {
    for b in repo.boards.values() {
        check_board(repo, b, d);
    }
    for b in repo.batteries.values() {
        check_battery(&b.file, &b.value, d);
    }
    check_airframes(repo, d);
    for s in repo.scenarios.values() {
        check_scenario(repo, &s.file, &s.value, d);
    }
}
