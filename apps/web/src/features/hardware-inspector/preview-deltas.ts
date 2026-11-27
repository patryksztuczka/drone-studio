import type { HardwarePreview } from "@drone-studio/engine-client";

export type Better = "higher" | "lower";

export interface PreviewRow {
  readonly label: string;
  readonly unit: string;
  readonly digits: number;
  readonly value: number;
  readonly baseline: number;
  readonly delta: number;
  readonly better: Better;
  readonly verdict: "better" | "worse" | "same";
}

const row = (
  label: string,
  unit: string,
  digits: number,
  value: number,
  baseline: number,
  better: Better,
): PreviewRow => {
  const delta = value - baseline;
  const threshold = 0.5 * 10 ** -digits;

  if (Math.abs(delta) < threshold) {
    return { label, unit, digits, value, baseline, delta: 0, better, verdict: "same" };
  }

  const improved = better === "higher" ? delta > 0 : delta < 0;

  return {
    label,
    unit,
    digits,
    value,
    baseline,
    delta,
    better,
    verdict: improved ? "better" : "worse",
  };
};

export const previewRows = (preview: HardwarePreview): ReadonlyArray<PreviewRow> => {
  const now = preview.performance;
  const was = preview.baseline_performance;

  return [
    row("All-up mass", "g", 1, preview.mass_g, preview.baseline_mass_g, "lower"),
    row("Thrust to weight", ":1", 2, now.thrust_to_weight, was.thrust_to_weight, "higher"),
    row("Hover time", "min", 2, now.hover_time_min, was.hover_time_min, "higher"),
    row("Hover current", "A", 2, now.hover_current_a, was.hover_current_a, "lower"),
    row(
      "Hover throttle",
      "%",
      1,
      now.hover_thrust_fraction * 100,
      was.hover_thrust_fraction * 100,
      "lower",
    ),
    row(
      "Max thrust per rotor",
      "N",
      3,
      now.max_thrust_per_rotor_n,
      was.max_thrust_per_rotor_n,
      "higher",
    ),
  ];
};
