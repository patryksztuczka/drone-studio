use drone_schema::manifest::{Assertion, AssertionKind, Axis, Scenario};
use drone_telemetry::{Event, Sample};
use serde::Serialize;

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct AssertionResult {
    pub kind: AssertionKind,
    pub passed: bool,
    pub measured: Option<f64>,
    pub limit: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub window: Option<[f64; 2]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub t_fail: Option<f64>,
}

fn in_window(samples: &[Sample], w: Option<[f64; 2]>) -> impl Iterator<Item = &Sample> {
    let [a, b] = w.unwrap_or([f64::NEG_INFINITY, f64::INFINITY]);
    samples.iter().filter(move |s| s.t >= a && s.t <= b)
}

fn result(
    a: &Assertion,
    passed: bool,
    measured: Option<f64>,
    limit: String,
    message: String,
    t_fail: Option<f64>,
) -> AssertionResult {
    AssertionResult {
        kind: a.kind,
        passed,
        measured,
        limit,
        message,
        window: a.window,
        t_fail: if passed { None } else { t_fail },
    }
}

fn round(v: f64) -> f64 {
    (v * 1000.0).round() / 1000.0
}

fn max_of<'a>(
    it: impl Iterator<Item = &'a Sample>,
    f: impl Fn(&Sample) -> f32,
) -> Option<(f64, f64)> {
    it.map(|s| (f64::from(f(s)), s.t))
        .fold(None, |acc, (v, t)| match acc {
            Some((m, _)) if m >= v => acc,
            _ => Some((v, t)),
        })
}

fn angle(s: &Sample, axis: Axis) -> f32 {
    match axis {
        Axis::Roll => s.roll,
        Axis::Pitch => s.pitch,
        Axis::Yaw => s.yaw,
    }
}

fn step_response(a: &Assertion, samples: &[Sample]) -> AssertionResult {
    let axis = a.axis.unwrap_or(Axis::Roll);
    let t0 = a.t.unwrap_or(0.0);
    let target = a.target_deg.unwrap_or(0.0);
    let hold_end = a.window.map_or(t0 + 0.95, |w| w[1]);
    let before: Vec<f32> = samples
        .iter()
        .filter(|s| s.t >= t0 - 0.05 && s.t < t0)
        .map(|s| angle(s, axis))
        .collect();
    let baseline = if before.is_empty() {
        0.0
    } else {
        f64::from(before.iter().sum::<f32>()) / before.len() as f64
    };
    let amplitude = target - baseline;
    let during: Vec<&Sample> = samples
        .iter()
        .filter(|s| s.t >= t0 && s.t <= hold_end)
        .collect();
    if during.is_empty() || amplitude.abs() < 1e-6 {
        return result(
            a,
            false,
            None,
            String::new(),
            "no samples in the step window".into(),
            Some(t0),
        );
    }
    let progress = |s: &Sample| (f64::from(angle(s, axis)) - baseline) / amplitude;
    let rise = during.iter().find(|s| progress(s) >= 0.9).map(|s| s.t - t0);
    let peak = during
        .iter()
        .map(|s| progress(s))
        .fold(f64::NEG_INFINITY, f64::max);
    let overshoot_pct = ((peak - 1.0) * 100.0).max(0.0);
    let settle_from = t0 + a.settle_s.unwrap_or(0.6);
    let tol = a.tolerance_deg.unwrap_or(2.0);
    let unsettled = during
        .iter()
        .filter(|s| s.t >= settle_from)
        .find(|s| (f64::from(angle(s, axis)) - target).abs() > tol);
    let mut problems = Vec::new();
    if let (Some(max), r) = (a.rise_time_max_s, rise) {
        match r {
            Some(r) if r <= max => {}
            Some(r) => problems.push(format!("rise time {r:.3} s > {max} s")),
            None => problems.push("never reached 90% of the step".to_owned()),
        }
    }
    if let Some(max) = a.max_overshoot_pct
        && overshoot_pct > max
    {
        problems.push(format!("overshoot {overshoot_pct:.1}% > {max}%"));
    }
    if let Some(s) = unsettled {
        problems.push(format!("not within {tol} deg of target at t={:.3}", s.t));
    }
    let measured = Some(round(overshoot_pct));
    let limit = format!(
        "overshoot <= {}%, rise <= {} s, settled by {:.2} s",
        a.max_overshoot_pct.unwrap_or(f64::INFINITY),
        a.rise_time_max_s.unwrap_or(f64::INFINITY),
        settle_from
    );
    let message = if problems.is_empty() {
        format!(
            "{axis:?} step to {target} deg: rise {:.3} s, overshoot {overshoot_pct:.1}%",
            rise.unwrap_or(f64::NAN)
        )
    } else {
        problems.join("; ")
    };
    result(
        a,
        problems.is_empty(),
        measured,
        limit,
        message,
        unsettled.map(|s| s.t).or(Some(t0)),
    )
}

pub fn evaluate(scenario: &Scenario, samples: &[Sample], events: &[Event]) -> Vec<AssertionResult> {
    scenario
        .assertions
        .iter()
        .map(|a| evaluate_one(a, samples, events))
        .collect()
}

fn evaluate_one(a: &Assertion, samples: &[Sample], events: &[Event]) -> AssertionResult {
    let w = a.window;
    match a.kind {
        AssertionKind::AltitudeWithin => {
            let (min, max) = (
                a.min.unwrap_or(f64::NEG_INFINITY),
                a.max.unwrap_or(f64::INFINITY),
            );
            let bad = in_window(samples, w)
                .find(|s| f64::from(s.height) < min || f64::from(s.height) > max);
            let lo = in_window(samples, w)
                .map(|s| f64::from(s.height))
                .fold(f64::INFINITY, f64::min);
            let hi = in_window(samples, w)
                .map(|s| f64::from(s.height))
                .fold(f64::NEG_INFINITY, f64::max);
            let msg = match bad {
                None => format!("height stayed within [{lo:.2}, {hi:.2}] m"),
                Some(s) => format!(
                    "height {:.2} m at t={:.2} s is outside [{min}, {max}] m",
                    s.height, s.t
                ),
            };
            result(
                a,
                bad.is_none(),
                Some(round(if bad.is_some_and(|s| f64::from(s.height) < min) {
                    lo
                } else {
                    hi
                })),
                format!("[{min}, {max}] m"),
                msg,
                bad.map(|s| s.t),
            )
        }
        AssertionKind::MaxTiltDeg => {
            let max = a.max.unwrap_or(f64::INFINITY);
            let worst = max_of(in_window(samples, w), Sample::tilt_deg);
            let (v, t) = worst.unwrap_or((0.0, 0.0));
            result(
                a,
                v <= max,
                Some(round(v)),
                format!("<= {max} deg"),
                format!("max tilt {v:.2} deg at t={t:.2} s"),
                Some(t),
            )
        }
        AssertionKind::AttitudeErrorRmsDeg => {
            let max = a.max.unwrap_or(f64::INFINITY);
            let errs: Vec<f64> = in_window(samples, w)
                .filter(|s| s.armed())
                .map(|s| {
                    let dr = f64::from(s.roll - s.sp_roll);
                    let dp = f64::from(s.pitch - s.sp_pitch);
                    dr * dr + dp * dp
                })
                .collect();
            let rms = if errs.is_empty() {
                0.0
            } else {
                (errs.iter().sum::<f64>() / errs.len() as f64).sqrt()
            };
            result(
                a,
                rms <= max,
                Some(round(rms)),
                format!("<= {max} deg"),
                format!("attitude error RMS {rms:.3} deg"),
                w.map(|w| w[0]),
            )
        }
        AssertionKind::NoFailsafe => {
            let first = samples.iter().find(|s| s.arm_state >= 2.0);
            result(
                a,
                first.is_none(),
                None,
                "never".into(),
                first.map_or("no failsafe".into(), |s| {
                    format!("failsafe at t={:.2} s", s.t)
                }),
                first.map(|s| s.t),
            )
        }
        AssertionKind::FailsafeTriggered => {
            let first = in_window(samples, w).find(|s| s.arm_state >= 2.0);
            let reason = events
                .iter()
                .find(|e| e.kind == "FAILSAFE")
                .map(|e| e.data.clone());
            result(
                a,
                first.is_some(),
                first.map(|s| round(s.t)),
                "triggered in window".into(),
                first.map_or("failsafe never triggered".into(), |s| {
                    format!(
                        "failsafe at t={:.2} s ({})",
                        s.t,
                        reason.unwrap_or_default()
                    )
                }),
                w.map(|w| w[1]),
            )
        }
        AssertionKind::ArmedAt => {
            let t = a.t.unwrap_or(0.0);
            let s = samples.iter().find(|s| s.t >= t);
            let ok = s.is_some_and(Sample::armed);
            result(
                a,
                ok,
                None,
                format!("armed at t={t}"),
                if ok {
                    format!("armed at t={t}")
                } else {
                    format!("not armed at t={t}")
                },
                Some(t),
            )
        }
        AssertionKind::DisarmedAtEnd => {
            let last = samples.last();
            let ok = last.is_some_and(|s| s.arm_state == 0.0);
            result(
                a,
                ok,
                None,
                "disarmed".into(),
                if ok {
                    "disarmed at the end".into()
                } else {
                    "still armed at the end".into()
                },
                last.map(|s| s.t),
            )
        }
        AssertionKind::TouchdownSpeedMaxMps => {
            let max = a.max.unwrap_or(f64::INFINITY);
            let touch: Vec<&Event> = events.iter().filter(|e| e.kind == "TOUCHDOWN").collect();
            if touch.is_empty() {
                return result(
                    a,
                    false,
                    None,
                    format!("<= {max} m/s"),
                    "never touched down".into(),
                    samples.last().map(|s| s.t),
                );
            }
            let (v, t) = touch
                .iter()
                .map(|e| {
                    (
                        e.data["vertical_speed_mps"]
                            .as_f64()
                            .unwrap_or(f64::INFINITY),
                        e.t,
                    )
                })
                .fold((0.0, 0.0), |acc, x| if x.0 > acc.0 { x } else { acc });
            result(
                a,
                v <= max,
                Some(round(v)),
                format!("<= {max} m/s"),
                format!("hardest touchdown {v:.2} m/s at t={t:.2} s"),
                Some(t),
            )
        }
        AssertionKind::BatteryMinV => {
            let min = a.min.unwrap_or(0.0);
            let (v, t) = samples.iter().map(|s| (f64::from(s.bat_v), s.t)).fold(
                (f64::INFINITY, 0.0),
                |acc, x| if x.0 < acc.0 { x } else { acc },
            );
            result(
                a,
                v >= min,
                Some(round(v)),
                format!(">= {min} V"),
                format!("minimum pack voltage {v:.2} V at t={t:.2} s"),
                Some(t),
            )
        }
        AssertionKind::StepResponse => step_response(a, samples),
        AssertionKind::MaxMotorSaturationPct => {
            let max = a.max.unwrap_or(0.0);
            let armed: Vec<&Sample> = in_window(samples, w).filter(|s| s.armed()).collect();
            let sat = armed
                .iter()
                .filter(|s| s.saturated > 0.0 || s.motors().iter().any(|m| *m >= 0.99))
                .count();
            let pct = if armed.is_empty() {
                0.0
            } else {
                sat as f64 * 100.0 / armed.len() as f64
            };
            let first = armed.iter().find(|s| s.saturated > 0.0).map(|s| s.t);
            result(
                a,
                pct <= max,
                Some(round(pct)),
                format!("<= {max}%"),
                format!("motors saturated {pct:.2}% of armed time"),
                first,
            )
        }
        AssertionKind::HorizontalSpeedMaxMps => {
            let max = a.max.unwrap_or(f64::INFINITY);
            let (v, t) =
                max_of(in_window(samples, w), Sample::horizontal_speed).unwrap_or((0.0, 0.0));
            result(
                a,
                v <= max,
                Some(round(v)),
                format!("<= {max} m/s"),
                format!("max horizontal speed {v:.2} m/s at t={t:.2} s"),
                Some(t),
            )
        }
    }
}
