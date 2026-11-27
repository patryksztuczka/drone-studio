import type { RunSummary } from "@drone-studio/engine-client";
import { RunId, ScenarioId } from "@drone-studio/engine-client";
import { describe, expect, it } from "vite-plus/test";

import { failedKinds, ghostDiffRows, runClock, runDay, runTime } from "./run-labels.ts";

const run = (
  maxHeight: number,
  saturation: number,
  failing: ReadonlyArray<string>,
): RunSummary => ({
  run_id: RunId.make("r"),
  created_at: "2026-11-27T13:01:12Z",
  scenario: ScenarioId.make("hover"),
  scenario_name: "Hover in calm air",
  result: failing.length === 0 ? "PASS" : "FAIL",
  source: "cli",
  seed: 1,
  params: {},
  duration_s: 10,
  metrics: {
    duration_s: 10,
    max_tilt_deg: 2,
    attitude_error_rms_deg: 1,
    altitude_error_rms_m: 0.1,
    min_battery_v: 7.6,
    max_current_a: 9,
    saturation_pct: saturation,
    max_height_m: maxHeight,
    failsafe: false,
  },
  assertions: [
    { kind: "no_crash", limit: "", measured: null, message: "", passed: true },
    ...failing.map((kind) => ({ kind, limit: "", measured: null, message: "", passed: false })),
  ],
});

describe("run labels", () => {
  it("shows the UTC time and day a run was recorded", () => {
    expect(runTime("2026-11-27T13:13:41Z")).toBe("13:13:41");
    expect(runDay("2026-11-27T13:13:41Z")).toBe("2026-11-27");
    expect(runClock("2026-11-27T13:13:41Z")).toBe("13:13");
  });

  it("keeps a timestamp it cannot read as it is", () => {
    expect(runTime("yesterday")).toBe("yesterday");
  });

  it("flags the metrics where the candidate drifted from or did worse than the baseline", () => {
    const rows = ghostDiffRows(run(23.5, 32.8, ["altitude_within"]), run(1.58, 0, []), {
      candidate: 36.9,
      baseline: 15.9,
    });

    expect(rows.map((row) => [row.label, row.worse])).toEqual([
      ["max height", true],
      ["saturation", true],
      ["energy", true],
      ["att. error", false],
    ]);
  });

  it("leaves out energy when a run has no battery column", () => {
    const rows = ghostDiffRows(run(1.6, 0, []), run(1.58, 0, []), {
      candidate: Number.NaN,
      baseline: 15.9,
    });

    expect(rows.map((row) => row.label)).toEqual(["max height", "saturation", "att. error"]);
    expect(rows.some((row) => row.worse)).toBe(false);
  });

  it("lists the assertions a run failed", () => {
    expect(failedKinds(run(1, 0, ["altitude_within", "motor_saturation"]))).toEqual([
      "altitude_within",
      "motor_saturation",
    ]);
  });
});
