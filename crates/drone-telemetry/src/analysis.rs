use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::event::Event;
use crate::sample::Sample;

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Summary {
    pub duration_s: f64,
    pub armed_s: f64,
    pub airborne_s: f64,
    pub max_height_m: f64,
    pub max_tilt_deg: f64,
    pub attitude_error_rms_deg: f64,
    pub attitude_error_max_deg: f64,
    pub estimator_error_rms_deg: f64,
    pub altitude_error_rms_m: f64,
    pub max_rate_dps: f64,
    pub max_horizontal_speed_mps: f64,
    pub horizontal_drift_m: f64,
    pub min_battery_v: f64,
    pub max_current_a: f64,
    pub consumed_mah: f64,
    pub saturation_pct: f64,
    pub max_touchdown_speed_mps: f64,
    pub failsafe: bool,
    pub events: BTreeMap<String, usize>,
}

fn rms(values: impl Iterator<Item = f64>) -> f64 {
    let (sum, n) = values.fold((0.0, 0usize), |(s, n), v| (s + v * v, n + 1));
    if n == 0 { 0.0 } else { (sum / n as f64).sqrt() }
}

fn r3(v: f64) -> f64 {
    if v.is_finite() {
        (v * 1000.0).round() / 1000.0
    } else {
        0.0
    }
}

fn dt_of(samples: &[Sample]) -> f64 {
    match samples {
        [a, b, ..] => b.t - a.t,
        _ => 0.0,
    }
}

pub fn summary(samples: &[Sample], events: &[Event]) -> Summary {
    let dt = dt_of(samples);
    let armed: Vec<&Sample> = samples.iter().filter(|s| s.armed()).collect();
    let flying: Vec<&Sample> = armed
        .iter()
        .copied()
        .filter(|s| s.airborne > 0.0 && s.height > 0.05)
        .collect();
    let start = samples.iter().find(|s| s.armed()).or(samples.first());
    let mut counts = BTreeMap::new();
    for e in events {
        *counts.entry(e.kind.clone()).or_insert(0) += 1;
    }
    let max_by = |f: &dyn Fn(&Sample) -> f64| samples.iter().map(f).fold(0.0_f64, f64::max);
    Summary {
        duration_s: r3(samples.last().map_or(0.0, |s| s.t)),
        armed_s: r3(armed.len() as f64 * dt),
        airborne_s: r3(flying.len() as f64 * dt),
        max_height_m: r3(max_by(&|s| f64::from(s.height))),
        max_tilt_deg: r3(max_by(&|s| f64::from(s.tilt_deg()))),
        attitude_error_rms_deg: r3(rms(flying.iter().map(|s| {
            let (dr, dp) = (
                f64::from(s.roll - s.sp_roll),
                f64::from(s.pitch - s.sp_pitch),
            );
            (dr * dr + dp * dp).sqrt()
        }))),
        attitude_error_max_deg: r3(flying
            .iter()
            .map(|s| {
                let (dr, dp) = (
                    f64::from(s.roll - s.sp_roll),
                    f64::from(s.pitch - s.sp_pitch),
                );
                (dr * dr + dp * dp).sqrt()
            })
            .fold(0.0, f64::max)),
        estimator_error_rms_deg: r3(rms(armed.iter().map(|s| {
            let (dr, dp) = (
                f64::from(s.roll - s.est_roll),
                f64::from(s.pitch - s.est_pitch),
            );
            (dr * dr + dp * dp).sqrt()
        }))),
        altitude_error_rms_m: r3(rms(flying.iter().map(|s| f64::from(s.est_alt - s.sp_alt)))),
        max_rate_dps: r3(max_by(&|s| {
            f64::from(s.rate_p.abs().max(s.rate_q.abs()).max(s.rate_r.abs()))
        })),
        max_horizontal_speed_mps: r3(max_by(&|s| f64::from(s.horizontal_speed()))),
        horizontal_drift_m: r3(start.map_or(0.0, |a| {
            samples
                .iter()
                .map(|s| f64::from((s.pos_n - a.pos_n).hypot(s.pos_e - a.pos_e)))
                .fold(0.0, f64::max)
        })),
        min_battery_v: r3(samples
            .iter()
            .map(|s| f64::from(s.bat_v))
            .fold(f64::INFINITY, f64::min)),
        max_current_a: r3(max_by(&|s| f64::from(s.bat_a))),
        consumed_mah: r3(samples.last().map_or(0.0, |s| f64::from(s.bat_mah))),
        saturation_pct: r3(if armed.is_empty() {
            0.0
        } else {
            armed.iter().filter(|s| s.saturated > 0.0).count() as f64 * 100.0 / armed.len() as f64
        }),
        max_touchdown_speed_mps: r3(events
            .iter()
            .filter(|e| e.kind == "TOUCHDOWN")
            .filter_map(|e| e.data["vertical_speed_mps"].as_f64())
            .fold(0.0, f64::max)),
        failsafe: samples.iter().any(|s| s.arm_state >= 2.0),
        events: counts,
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnomalyKind {
    Oscillation,
    MotorSaturation,
    VoltageDrop,
    LowVoltage,
    AttitudeError,
    EstimatorDivergence,
    HardLanding,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    Info,
    Warning,
    Critical,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Anomaly {
    pub kind: AnomalyKind,
    pub severity: Severity,
    pub t_start: f64,
    pub t_end: f64,
    pub channel: String,
    pub value: f64,
    pub unit: String,
    pub detail: String,
}

#[derive(Clone, Copy, Debug)]
pub struct Thresholds {
    pub oscillation_window_s: f64,
    pub oscillation_min_amplitude_dps: f64,
    pub oscillation_min_hz: f64,
    pub oscillation_max_hz: f64,
    pub saturation_min_s: f64,
    pub sag_drop_v: f64,
    pub sag_window_s: f64,
    pub sag_min_s: f64,
    pub low_cell_v: f64,
    pub attitude_error_deg: f64,
    pub attitude_error_min_s: f64,
    pub estimator_error_deg: f64,
    pub hard_landing_mps: f64,
}

impl Default for Thresholds {
    fn default() -> Self {
        Self {
            oscillation_window_s: 0.5,
            oscillation_min_amplitude_dps: 8.0,
            oscillation_min_hz: 4.0,
            oscillation_max_hz: 120.0,
            saturation_min_s: 0.02,
            sag_drop_v: 0.4,
            sag_window_s: 0.5,
            sag_min_s: 0.05,
            low_cell_v: 3.5,
            attitude_error_deg: 8.0,
            attitude_error_min_s: 0.2,
            estimator_error_deg: 3.0,
            hard_landing_mps: 1.0,
        }
    }
}

fn intervals(
    samples: &[Sample],
    min_s: f64,
    pred: impl Fn(&Sample) -> bool,
) -> Vec<(usize, usize)> {
    let mut out = Vec::new();
    let mut start: Option<usize> = None;
    for (i, s) in samples.iter().enumerate() {
        match (pred(s), start) {
            (true, None) => start = Some(i),
            (false, Some(a)) => {
                if samples[i - 1].t - samples[a].t >= min_s {
                    out.push((a, i - 1));
                }
                start = None;
            }
            _ => {}
        }
    }
    if let Some(a) = start
        && let Some(last) = samples.last()
        && last.t - samples[a].t >= min_s
    {
        out.push((a, samples.len() - 1));
    }
    out
}

type Channel = (&'static str, fn(&Sample) -> f32);

fn oscillations(samples: &[Sample], th: &Thresholds, out: &mut Vec<Anomaly>) {
    let dt = dt_of(samples);
    if dt <= 0.0 {
        return;
    }
    let win = ((th.oscillation_window_s / dt).round() as usize).max(8);
    let hop = (win / 2).max(1);
    let channels: [Channel; 3] = [
        ("gyro_p", |s| s.gyro_p - s.sp_rate_p),
        ("gyro_q", |s| s.gyro_q - s.sp_rate_q),
        ("gyro_r", |s| s.gyro_r - s.sp_rate_r),
    ];
    for (name, f) in channels {
        let mut hits: Vec<(f64, f64, f64, f64)> = Vec::new();
        let mut i = 0;
        while i + win <= samples.len() {
            let w = &samples[i..i + win];
            if w.iter().all(Sample::armed) {
                let x: Vec<f64> = w.iter().map(|s| f64::from(f(s))).collect();
                let mean = x.iter().sum::<f64>() / x.len() as f64;
                let centered: Vec<f64> = x.iter().map(|v| v - mean).collect();
                let amp = rms(centered.iter().copied()) * core::f64::consts::SQRT_2;
                let hysteresis = amp * 0.3;
                let mut state = 0i8;
                let mut crossings = 0usize;
                for v in &centered {
                    if *v > hysteresis {
                        crossings += usize::from(state < 0);
                        state = 1;
                    } else if *v < -hysteresis {
                        crossings += usize::from(state > 0);
                        state = -1;
                    }
                }
                let span = w[w.len() - 1].t - w[0].t;
                let freq = crossings as f64 / (2.0 * span);
                if amp >= th.oscillation_min_amplitude_dps
                    && crossings >= 6
                    && freq >= th.oscillation_min_hz
                    && freq <= th.oscillation_max_hz
                {
                    hits.push((w[0].t, w[w.len() - 1].t, freq, amp));
                }
            }
            i += hop;
        }
        let mut merged: Vec<(f64, f64, f64, f64, usize)> = Vec::new();
        for (a, b, f, amp) in hits {
            match merged.last_mut() {
                Some(m) if a <= m.1 + 1e-9 => {
                    m.1 = b;
                    m.2 += f;
                    m.3 = m.3.max(amp);
                    m.4 += 1;
                }
                _ => merged.push((a, b, f, amp, 1)),
            }
        }
        for (a, b, fsum, amp, n) in merged {
            let freq = fsum / n as f64;
            out.push(Anomaly {
                kind: AnomalyKind::Oscillation,
                severity: if amp > 3.0 * th.oscillation_min_amplitude_dps {
                    Severity::Critical
                } else {
                    Severity::Warning
                },
                t_start: r3(a),
                t_end: r3(b),
                channel: name.to_owned(),
                value: r3(freq),
                unit: "Hz".into(),
                detail: format!(
                    "{name} rate error oscillates at {freq:.1} Hz with {amp:.1} deg/s amplitude"
                ),
            });
        }
    }
}

pub fn anomalies(samples: &[Sample], events: &[Event], th: &Thresholds) -> Vec<Anomaly> {
    let mut out = Vec::new();
    oscillations(samples, th, &mut out);

    for motor in 0..4 {
        for (a, b) in intervals(samples, th.saturation_min_s, |s| {
            s.armed()
                && (s.motors()[motor] >= 0.98 || (s.saturated > 0.0 && s.motors()[motor] >= 0.95))
        }) {
            let dur = samples[b].t - samples[a].t;
            out.push(Anomaly {
                kind: AnomalyKind::MotorSaturation,
                severity: if dur > 0.5 {
                    Severity::Critical
                } else {
                    Severity::Warning
                },
                t_start: r3(samples[a].t),
                t_end: r3(samples[b].t),
                channel: format!("motor_{}", motor + 1),
                value: r3(dur),
                unit: "s".into(),
                detail: format!(
                    "motor {} pinned at full command for {:.0} ms",
                    motor + 1,
                    dur * 1000.0
                ),
            });
        }
    }

    let dt = dt_of(samples);
    if dt > 0.0 {
        let lag = ((th.sag_window_s / dt).round() as usize).max(1);
        let mut i = lag;
        while i < samples.len() {
            let before = &samples[i - lag];
            let now = &samples[i];
            let drop = f64::from(before.bat_v - now.bat_v);
            if drop >= th.sag_drop_v {
                let mut j = i;
                while j + 1 < samples.len() && samples[j + 1].bat_v <= samples[j].bat_v + 0.01 {
                    j += 1;
                }
                let onset = (i - lag..=i)
                    .rev()
                    .find(|k| samples[*k].bat_v >= before.bat_v - 0.05)
                    .unwrap_or(i - lag);
                let before = &samples[onset];
                let total = f64::from(before.bat_v - samples[j].bat_v);
                let half = before.bat_v - (total / 2.0) as f32;
                let mut k = j;
                while k + 1 < samples.len() && samples[k + 1].bat_v < half {
                    k += 1;
                }
                if samples[k].t - samples[onset].t < th.sag_min_s {
                    i = j + 1;
                    continue;
                }
                out.push(Anomaly {
                    kind: AnomalyKind::VoltageDrop,
                    severity: if total > 1.0 {
                        Severity::Critical
                    } else if total > 0.6 {
                        Severity::Warning
                    } else {
                        Severity::Info
                    },
                    t_start: r3(before.t),
                    t_end: r3(samples[j].t),
                    channel: "bat_v".into(),
                    value: r3(total),
                    unit: "V".into(),
                    detail: format!(
                        "pack voltage fell {:.2} V ({:.2} -> {:.2} V) at {:.1} A",
                        total,
                        before.bat_v,
                        samples[j].bat_v,
                        samples[i..=j].iter().map(|s| s.bat_a).fold(0.0, f32::max)
                    ),
                });
                i = j + lag;
                continue;
            }
            i += 1;
        }
    }

    let cells = samples.first().map_or(2.0, |s| {
        if s.bat_v > 13.0 {
            4.0
        } else if s.bat_v > 9.0 {
            3.0
        } else {
            2.0
        }
    });
    for (a, b) in intervals(samples, 0.1, |s| {
        s.armed() && f64::from(s.bat_v) < th.low_cell_v * cells
    }) {
        let min = samples[a..=b]
            .iter()
            .map(|s| f64::from(s.bat_v))
            .fold(f64::INFINITY, f64::min);
        out.push(Anomaly {
            kind: AnomalyKind::LowVoltage,
            severity: if min < 3.3 * cells {
                Severity::Critical
            } else {
                Severity::Warning
            },
            t_start: r3(samples[a].t),
            t_end: r3(samples[b].t),
            channel: "bat_v".into(),
            value: r3(min),
            unit: "V".into(),
            detail: format!(
                "pack below {:.2} V/cell, minimum {:.2} V",
                th.low_cell_v,
                min / cells
            ),
        });
    }

    for (a, b) in intervals(samples, th.attitude_error_min_s, |s| {
        s.armed() && s.airborne > 0.0 && f64::from(s.attitude_error_deg()) > th.attitude_error_deg
    }) {
        let worst = samples[a..=b]
            .iter()
            .map(|s| f64::from(s.attitude_error_deg()))
            .fold(0.0, f64::max);
        out.push(Anomaly {
            kind: AnomalyKind::AttitudeError,
            severity: if worst > 3.0 * th.attitude_error_deg {
                Severity::Critical
            } else {
                Severity::Warning
            },
            t_start: r3(samples[a].t),
            t_end: r3(samples[b].t),
            channel: "attitude".into(),
            value: r3(worst),
            unit: "deg".into(),
            detail: format!("estimated attitude {worst:.1} deg away from setpoint"),
        });
    }

    for (a, b) in intervals(samples, 0.2, |s| {
        s.armed()
            && (f64::from(s.roll - s.est_roll).hypot(f64::from(s.pitch - s.est_pitch)))
                > th.estimator_error_deg
    }) {
        let worst = samples[a..=b]
            .iter()
            .map(|s| f64::from(s.roll - s.est_roll).hypot(f64::from(s.pitch - s.est_pitch)))
            .fold(0.0, f64::max);
        out.push(Anomaly {
            kind: AnomalyKind::EstimatorDivergence,
            severity: Severity::Critical,
            t_start: r3(samples[a].t),
            t_end: r3(samples[b].t),
            channel: "attitude_estimate".into(),
            value: r3(worst),
            unit: "deg".into(),
            detail: format!("AHRS estimate is {worst:.1} deg away from the true attitude"),
        });
    }

    for e in events.iter().filter(|e| e.kind == "TOUCHDOWN") {
        let v = e.data["vertical_speed_mps"].as_f64().unwrap_or(0.0);
        if v > th.hard_landing_mps {
            out.push(Anomaly {
                kind: AnomalyKind::HardLanding,
                severity: Severity::Warning,
                t_start: r3(e.t),
                t_end: r3(e.t),
                channel: "vel_d".into(),
                value: r3(v),
                unit: "m/s".into(),
                detail: format!("touched down at {v:.2} m/s"),
            });
        }
    }
    out.sort_by(|a, b| a.t_start.total_cmp(&b.t_start).then(a.kind.cmp(&b.kind)));
    out
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Slice {
    pub t_start: f64,
    pub t_end: f64,
    pub rows: usize,
    pub decimation: usize,
    pub t: Vec<f64>,
    pub columns: BTreeMap<String, Vec<f32>>,
    pub units: BTreeMap<String, String>,
}

pub const DEFAULT_SLICE_SIGNALS: &[&str] = &[
    "height",
    "roll",
    "pitch",
    "yaw",
    "sp_roll",
    "sp_pitch",
    "gyro_p",
    "gyro_q",
    "gyro_r",
    "motor_1",
    "motor_2",
    "motor_3",
    "motor_4",
    "bat_v",
    "bat_a",
    "arm_state",
];

pub fn slice(
    samples: &[Sample],
    t0: f64,
    t1: f64,
    signals: &[String],
    max_rows: usize,
) -> Result<Slice, String> {
    let unknown: Vec<&String> = signals
        .iter()
        .filter(|s| Sample::default().get(s).is_none())
        .collect();
    if !unknown.is_empty() {
        return Err(format!(
            "unknown signals {unknown:?}; available: {}",
            crate::sample::COLUMNS
                .iter()
                .map(|c| c.0)
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }
    let window: Vec<&Sample> = samples.iter().filter(|s| s.t >= t0 && s.t <= t1).collect();
    let decimation = window.len().div_ceil(max_rows.max(1)).max(1);
    let picked: Vec<&Sample> = window.iter().step_by(decimation).copied().collect();
    let names: Vec<String> = if signals.is_empty() {
        DEFAULT_SLICE_SIGNALS
            .iter()
            .map(|s| (*s).to_owned())
            .collect()
    } else {
        signals.to_vec()
    };
    let mut columns = BTreeMap::new();
    let mut units = BTreeMap::new();
    for n in &names {
        columns.insert(
            n.clone(),
            picked
                .iter()
                .map(|s| s.get(n).unwrap_or(f32::NAN))
                .collect(),
        );
        if let Some((_, u)) = crate::sample::COLUMNS.iter().find(|c| c.0 == n) {
            units.insert(n.clone(), (*u).to_owned());
        }
    }
    Ok(Slice {
        t_start: t0,
        t_end: t1,
        rows: picked.len(),
        decimation,
        t: picked.iter().map(|s| r3(s.t * 1000.0) / 1000.0).collect(),
        columns,
        units,
    })
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct MetricDelta {
    pub baseline: f64,
    pub candidate: f64,
    pub delta: f64,
    pub change_pct: Option<f64>,
    pub better: Option<bool>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TrackDelta {
    pub signal: String,
    pub rms_difference: f64,
    pub max_difference: f64,
    pub at_t: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Diff {
    pub metrics: BTreeMap<String, MetricDelta>,
    pub tracks: Vec<TrackDelta>,
    pub improved: Vec<String>,
    pub regressed: Vec<String>,
    pub verdict: String,
}

const LOWER_IS_BETTER: &[&str] = &[
    "max_tilt_deg",
    "attitude_error_rms_deg",
    "attitude_error_max_deg",
    "estimator_error_rms_deg",
    "altitude_error_rms_m",
    "max_horizontal_speed_mps",
    "horizontal_drift_m",
    "max_current_a",
    "consumed_mah",
    "saturation_pct",
    "max_touchdown_speed_mps",
];

pub fn diff(baseline: (&Summary, &[Sample]), candidate: (&Summary, &[Sample])) -> Diff {
    let a = serde_json::to_value(baseline.0).unwrap_or_default();
    let b = serde_json::to_value(candidate.0).unwrap_or_default();
    let mut metrics = BTreeMap::new();
    let mut improved = Vec::new();
    let mut regressed = Vec::new();
    if let (Some(a), Some(b)) = (a.as_object(), b.as_object()) {
        for (k, va) in a {
            let (Some(x), Some(y)) = (va.as_f64(), b.get(k).and_then(serde_json::Value::as_f64))
            else {
                continue;
            };
            let delta = y - x;
            let better = LOWER_IS_BETTER.contains(&k.as_str()).then_some(delta < 0.0);
            let rel = if x.abs() > 1e-9 {
                Some(r3(delta / x.abs() * 100.0))
            } else {
                None
            };
            let significant = delta.abs() > 1e-3 && rel.is_none_or(|r| r.abs() >= 2.0);
            if significant {
                match better {
                    Some(true) => improved.push(k.clone()),
                    Some(false) => regressed.push(k.clone()),
                    None => {}
                }
            }
            metrics.insert(
                k.clone(),
                MetricDelta {
                    baseline: x,
                    candidate: y,
                    delta: r3(delta),
                    change_pct: rel,
                    better: if significant { better } else { None },
                },
            );
        }
    }
    let mut tracks = Vec::new();
    for signal in ["height", "roll", "pitch", "yaw", "pos_n", "pos_e", "bat_v"] {
        let (mut sum, mut n, mut max, mut at) = (0.0, 0usize, 0.0_f64, 0.0);
        let mut j = 0;
        for s in baseline.1 {
            while j + 1 < candidate.1.len() && candidate.1[j].t < s.t - 1e-9 {
                j += 1;
            }
            let Some(c) = candidate.1.get(j) else {
                break;
            };
            if (c.t - s.t).abs() > 0.01 {
                continue;
            }
            let d = f64::from(s.get(signal).unwrap_or(0.0) - c.get(signal).unwrap_or(0.0));
            sum += d * d;
            n += 1;
            if d.abs() > max {
                max = d.abs();
                at = s.t;
            }
        }
        if n > 0 {
            tracks.push(TrackDelta {
                signal: signal.into(),
                rms_difference: r3((sum / n as f64).sqrt()),
                max_difference: r3(max),
                at_t: r3(at),
            });
        }
    }
    let verdict = match (improved.is_empty(), regressed.is_empty()) {
        (true, true) => "equivalent".to_owned(),
        (false, true) => "candidate is better".to_owned(),
        (true, false) => "candidate is worse".to_owned(),
        (false, false) => "mixed: some metrics improved, some regressed".to_owned(),
    };
    Diff {
        metrics,
        tracks,
        improved,
        regressed,
        verdict,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hover(n: usize, dt: f64) -> Vec<Sample> {
        (0..n)
            .map(|i| {
                let t = i as f64 * dt;
                let wobble = ((i * 7919) % 13) as f32 * 0.05 - 0.3;
                Sample {
                    t,
                    arm_state: 1.0,
                    airborne: 1.0,
                    height: 1.0,
                    gyro_p: wobble,
                    gyro_q: -wobble,
                    motor_1: 0.45,
                    motor_2: 0.46,
                    motor_3: 0.45,
                    motor_4: 0.44,
                    bat_v: 8.2 - t as f32 * 0.01,
                    bat_a: 6.0,
                    q_w: 1.0,
                    ..Sample::default()
                }
            })
            .collect()
    }

    #[test]
    fn quiet_hover_has_no_anomalies() {
        let s = hover(5000, 0.002);
        assert!(anomalies(&s, &[], &Thresholds::default()).is_empty());
    }

    #[test]
    fn detects_injected_oscillation_saturation_and_sag() {
        let dt = 0.002;
        let mut s = hover(5000, dt);
        for x in s.iter_mut() {
            if x.t >= 3.0 && x.t < 5.0 {
                x.gyro_p += 30.0 * (2.0 * core::f64::consts::PI * 12.0 * x.t).sin() as f32;
            }
            if x.t >= 6.0 && x.t < 6.5 {
                x.motor_2 = 1.0;
                x.saturated = 1.0;
            }
            if x.t >= 7.0 && x.t < 7.3 {
                x.bat_v -= 0.8 * ((x.t - 7.0) / 0.1).min(1.0) as f32;
                x.bat_a = 25.0;
            }
        }
        let found = anomalies(&s, &[], &Thresholds::default());
        let osc: Vec<_> = found
            .iter()
            .filter(|a| a.kind == AnomalyKind::Oscillation)
            .collect();
        assert_eq!(osc.len(), 1, "{found:#?}");
        assert_eq!(osc[0].channel, "gyro_p");
        assert!((osc[0].value - 12.0).abs() < 1.5, "freq {}", osc[0].value);
        assert!(
            osc[0].t_start >= 2.7
                && osc[0].t_start <= 3.3
                && osc[0].t_end >= 4.7
                && osc[0].t_end <= 5.3
        );
        let sat: Vec<_> = found
            .iter()
            .filter(|a| a.kind == AnomalyKind::MotorSaturation)
            .collect();
        assert_eq!(sat.len(), 1);
        assert_eq!(sat[0].channel, "motor_2");
        assert!((sat[0].t_start - 6.0).abs() < 0.01 && (sat[0].value - 0.498).abs() < 0.01);
        let sag: Vec<_> = found
            .iter()
            .filter(|a| a.kind == AnomalyKind::VoltageDrop)
            .collect();
        assert_eq!(sag.len(), 1, "{found:#?}");
        assert!(sag[0].value > 0.7 && sag[0].t_start >= 6.4 && sag[0].t_end <= 7.4);
    }

    #[test]
    fn slice_decimates_and_rejects_unknown_signals() {
        let s = hover(5000, 0.002);
        let sl = slice(&s, 1.0, 2.0, &["bat_v".into(), "motor_1".into()], 100).expect("slice");
        assert!(sl.rows <= 100 && sl.rows >= 80, "{}", sl.rows);
        assert_eq!(sl.columns["bat_v"].len(), sl.rows);
        assert!(slice(&s, 0.0, 1.0, &["nope".into()], 10).is_err());
    }

    #[test]
    fn diff_reports_improvement() {
        let s = hover(1000, 0.002);
        let a = Summary {
            attitude_error_rms_deg: 2.0,
            ..Summary::default()
        };
        let b = Summary {
            attitude_error_rms_deg: 1.0,
            ..Summary::default()
        };
        let d = diff((&a, &s), (&b, &s));
        assert_eq!(d.improved, ["attitude_error_rms_deg"]);
        assert_eq!(d.verdict, "candidate is better");
        assert!(d.tracks.iter().all(|t| t.rms_difference == 0.0));
    }
}
