import type { EmuStatus, SmokeReport } from "@drone-studio/engine-client";

export type StepState = "done" | "failed" | "running" | "pending" | "planned";

export interface SmokeStep {
  readonly label: string;
  readonly state: StepState;
}

const passed = (report: SmokeReport | null, index: number): StepState => {
  const test = report?.tests?.[index];

  if (test === undefined) return report === null ? "pending" : "failed";

  return test.passed ? "done" : "failed";
};

export const smokeSteps = (
  status: EmuStatus | undefined,
  running: boolean,
): ReadonlyArray<SmokeStep> => {
  const report = status?.last_smoke ?? null;
  const planned = { label: "real board", state: "planned" } as const;

  if (running) {
    return [
      { label: "build .elf", state: "running" },
      { label: "boot Renode", state: "pending" },
      { label: "probe IMU", state: "pending" },
      { label: "100 loop ticks", state: "pending" },
      planned,
    ];
  }

  const built: StepState =
    report?.elf !== undefined || status?.elf_built === true
      ? "done"
      : report === null
        ? "pending"
        : "failed";

  const booted: StepState =
    report === null ? "pending" : (report.tests?.length ?? 0) > 0 ? "done" : "failed";

  const loop =
    passed(report, 1) === "done" && passed(report, 2) === "done" ? "done" : passed(report, 1);

  return [
    { label: "build .elf", state: built },
    { label: "boot Renode", state: booted },
    { label: "probe IMU", state: passed(report, 0) },
    { label: "100 loop ticks", state: loop },
    planned,
  ];
};

export const smokeVerdict = (report: SmokeReport | null) => {
  if (report === null) return "never";

  return report.ok ? "PASS" : "FAIL";
};
