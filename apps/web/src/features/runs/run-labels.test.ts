import type { RunSummary } from "@drone-studio/engine-client";
import { RunId, ScenarioId } from "@drone-studio/engine-client";
import { describe, expect, it } from "vite-plus/test";

import { failedAssertions, runDay, runTime, unseenAgentRun } from "./run-labels.ts";

const run = (source: string, createdAt: string, failing: number): RunSummary => ({
  run_id: RunId.make(`${source}-${createdAt}`),
  created_at: createdAt,
  scenario: ScenarioId.make("01_hover_calm"),
  scenario_name: "Hover in calm air",
  result: failing === 0 ? "PASS" : "FAIL",
  source,
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
    saturation_pct: 0,
    max_height_m: 1.5,
    failsafe: false,
  },
  assertions: Array.from({ length: failing }, () => ({
    kind: "altitude_within",
    limit: "",
    measured: null,
    message: "",
    passed: false,
  })),
});

describe("run labels", () => {
  it("shows the UTC time and day a run was recorded", () => {
    expect(runTime("2026-11-27T13:13:41Z")).toBe("13:13:41");
    expect(runDay("2026-11-27T13:13:41Z")).toBe("2026-11-27");
  });

  it("keeps a timestamp it cannot read as it is", () => {
    expect(runTime("yesterday")).toBe("yesterday");
  });

  it("counts the assertions a run failed", () => {
    expect(failedAssertions(run("cli", "2026-11-27T13:01:20Z", 3))).toBe(3);
  });

  it("flags an agent run recorded after the feed was last opened", () => {
    const feed = [run("mcp", "2026-11-27T14:20:00Z", 0), run("suite", "2026-11-27T14:30:00Z", 0)];

    expect(unseenAgentRun(feed, "2026-11-27T14:10:00Z")).toBe(true);
    expect(unseenAgentRun(feed, "2026-11-27T14:30:00Z")).toBe(false);
    expect(unseenAgentRun([run("suite", "2026-11-27T15:00:00Z", 0)], "")).toBe(false);
  });
});
