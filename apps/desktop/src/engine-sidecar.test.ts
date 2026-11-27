import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";

import { EngineSource, engineSource, readyUrl, windowPlan, withEngine } from "./engine-sidecar.ts";

describe("readyUrl", () => {
  it("reads the URL from the line drone-engine prints when it listens", () => {
    expect(readyUrl("DRONE_ENGINE_READY ws://127.0.0.1:51234\n")).toEqual(
      Option.some(new URL("ws://127.0.0.1:51234")),
    );
  });

  it("ignores every other line and a URL that is not a WebSocket", () => {
    for (const line of [
      "",
      "listening",
      "DRONE_ENGINE_READY http://127.0.0.1:1",
      "DRONE_ENGINE_READY",
    ]) {
      expect(readyUrl(line)).toEqual(Option.none());
    }
  });
});

describe("engineSource", () => {
  it("attaches to an engine named in the environment", () => {
    const url = new URL("ws://127.0.0.1:47800");

    expect(engineSource(Option.some(url), "/repo")).toEqual(
      EngineSource.cases.Attach.make({ url }),
    );
  });

  it("starts the release build from the repository otherwise", () => {
    expect(engineSource(Option.none(), "/repo")).toEqual(
      EngineSource.cases.Spawn.make({ root: "/repo", binary: "/repo/target/release/drone-engine" }),
    );
  });
});

describe("withEngine", () => {
  it("hands the engine URL to the renderer as a query parameter, keeping the page", () => {
    expect(
      withEngine(new URL("http://localhost:26570/"), new URL("ws://127.0.0.1:51234")).href,
    ).toBe("http://localhost:26570/?engine=ws%3A%2F%2F127.0.0.1%3A51234");
  });
});

describe("windowPlan", () => {
  it("keeps a smoke run's window hidden and painting", () => {
    expect(windowPlan(true)).toEqual({ showWhenReady: false, backgroundThrottling: false });
    expect(windowPlan(false)).toEqual({ showWhenReady: true, backgroundThrottling: true });
  });
});
