import type { RunSummary } from "@drone-studio/engine-client";

export const runTime = (createdAt: string) => {
  const match = /T(\d{2}):(\d{2}):(\d{2})/.exec(createdAt);

  return match === null ? createdAt : `${match[1] ?? ""}:${match[2] ?? ""}:${match[3] ?? ""}`;
};

export const runDay = (createdAt: string) => createdAt.slice(0, 10);

export const paramSummary = (run: RunSummary) =>
  Object.entries(run.params)
    .map(([name, value]) => `${name}=${String(value)}`)
    .join(" ");

export const runClock = (createdAt: string) => runTime(createdAt).slice(0, 5);

export interface DiffRow {
  readonly label: string;
  readonly unit: string;
  readonly candidate: number;
  readonly baseline: number;
  readonly worse: boolean;
}

const lowerIsBetter = (candidate: number, baseline: number, slack: number) =>
  candidate > baseline + slack;

const drifted = (candidate: number, baseline: number) =>
  Math.abs(candidate - baseline) > Math.max(Math.abs(baseline) * 0.2, 0.05);

export const ghostDiffRows = (
  candidate: RunSummary,
  baseline: RunSummary,
  energy: { readonly candidate: number; readonly baseline: number },
): ReadonlyArray<DiffRow> => {
  const rows: Array<DiffRow> = [
    {
      label: "max height",
      unit: "m",
      candidate: candidate.metrics.max_height_m,
      baseline: baseline.metrics.max_height_m,
      worse: drifted(candidate.metrics.max_height_m, baseline.metrics.max_height_m),
    },
    {
      label: "saturation",
      unit: "%",
      candidate: candidate.metrics.saturation_pct,
      baseline: baseline.metrics.saturation_pct,
      worse: lowerIsBetter(candidate.metrics.saturation_pct, baseline.metrics.saturation_pct, 0.5),
    },
  ];

  if (Number.isFinite(energy.candidate) && Number.isFinite(energy.baseline)) {
    rows.push({
      label: "energy",
      unit: "mAh",
      candidate: energy.candidate,
      baseline: energy.baseline,
      worse: lowerIsBetter(energy.candidate, energy.baseline, Math.abs(energy.baseline) * 0.1),
    });
  }

  rows.push({
    label: "att. error",
    unit: "°",
    candidate: candidate.metrics.attitude_error_rms_deg,
    baseline: baseline.metrics.attitude_error_rms_deg,
    worse: lowerIsBetter(
      candidate.metrics.attitude_error_rms_deg,
      baseline.metrics.attitude_error_rms_deg,
      Math.abs(baseline.metrics.attitude_error_rms_deg) * 0.2,
    ),
  });

  return rows;
};

export const failedKinds = (run: RunSummary) =>
  run.assertions.flatMap((assertion) => (assertion.passed ? [] : [assertion.kind]));

export const latestRunFailed = (list: ReadonlyArray<RunSummary>) => list[0]?.result === "FAIL";
