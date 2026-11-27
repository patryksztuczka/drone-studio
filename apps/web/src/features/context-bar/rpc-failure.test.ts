import {
  EngineOfflineError,
  EngineRefusedError,
  EngineTimeoutError,
} from "@drone-studio/engine-client";
import { describe, expect, it } from "vite-plus/test";

import { rpcFailureTitle } from "./rpc-failure.ts";

describe("rpcFailureTitle", () => {
  it("names the method and why it failed in a few words", () => {
    expect(
      rpcFailureTitle(new EngineOfflineError({ method: "sim.start", url: "ws://127.0.0.1:9" })),
    ).toBe("sim.start failed: engine offline");
    expect(rpcFailureTitle(new EngineTimeoutError({ method: "emu.smoke" }))).toBe(
      "emu.smoke failed: no answer in time",
    );
  });

  it("passes the engine's own reason through when it refuses", () => {
    expect(
      rpcFailureTitle(
        new EngineRefusedError({ method: "sim.speed", reason: "speed out of range" }),
      ),
    ).toBe("sim.speed failed: speed out of range");
  });
});
