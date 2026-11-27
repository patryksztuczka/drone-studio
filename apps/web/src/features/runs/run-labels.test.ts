import { describe, expect, it } from "vite-plus/test";

import { runDay, runTime } from "./run-labels.ts";

describe("run labels", () => {
  it("shows the UTC time and day a run was recorded", () => {
    expect(runTime("2026-11-27T13:13:41Z")).toBe("13:13:41");
    expect(runDay("2026-11-27T13:13:41Z")).toBe("2026-11-27");
  });

  it("keeps a timestamp it cannot read as it is", () => {
    expect(runTime("yesterday")).toBe("yesterday");
  });
});
