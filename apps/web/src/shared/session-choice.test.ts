import { describe, expect, it } from "vite-plus/test";

import { flyingChoice } from "./session-choice.ts";

describe("flyingChoice", () => {
  it("resumes a session that flies the picked scenario", () => {
    expect(
      flyingChoice(
        { mode: "scenario", scenario: "03_wind_gust_6ms" },
        "03_wind_gust_6ms",
        "manual",
      ),
    ).toBe(true);
    expect(flyingChoice({ mode: "manual", scenario: "manual_flight" }, "manual", "manual")).toBe(
      true,
    );
  });

  it("asks for a new session once another scenario is picked", () => {
    expect(
      flyingChoice({ mode: "manual", scenario: "manual_flight" }, "03_wind_gust_6ms", "manual"),
    ).toBe(false);
    expect(flyingChoice({ mode: "scenario", scenario: "01_hover_calm" }, "manual", "manual")).toBe(
      false,
    );
  });

  it("keeps the running session when nothing was picked yet", () => {
    expect(flyingChoice({ mode: "scenario", scenario: "01_hover_calm" }, undefined, "manual")).toBe(
      true,
    );
  });
});
