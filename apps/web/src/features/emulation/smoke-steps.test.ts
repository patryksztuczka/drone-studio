import type { EmuStatus, SmokeReport } from "@drone-studio/engine-client";
import { describe, expect, it } from "vite-plus/test";

import { smokeSteps, smokeVerdict } from "./smoke-steps.ts";

const test = (name: string, ok: boolean) => ({ name, passed: ok, message: "" });

const report = (tests: SmokeReport["tests"], ok: boolean): SmokeReport => ({
  ok,
  elf: "firmware/target-stm32h7/target/thumbv7em-none-eabihf/release/target-stm32h7",
  tests,
  uart_log_tail: [],
});

const status = (last: SmokeReport | null): EmuStatus => ({
  docker: "29.0.1",
  elf_built: last !== null,
  repl: true,
  last_smoke: last,
  hint: "",
});

const states = (input: EmuStatus | undefined, running = false) =>
  smokeSteps(input, running).map((step) => step.state);

describe("smoke pipeline", () => {
  it("marks every step done after a passing run and keeps the real board for M2", () => {
    const passing = report(
      [test("probe", true), test("samples", true), test("motors", true)],
      true,
    );

    expect(states(status(passing))).toEqual(["done", "done", "done", "done", "planned"]);
    expect(smokeVerdict(passing)).toBe("PASS");
  });

  it("stops at the first test that failed", () => {
    const failing = report(
      [test("probe", true), test("samples", false), test("motors", true)],
      false,
    );

    expect(states(status(failing))).toEqual(["done", "done", "done", "failed", "planned"]);
    expect(smokeVerdict(failing)).toBe("FAIL");
  });

  it("shows a build that never booted as a boot failure", () => {
    const broken: SmokeReport = { ok: false, error: "docker: not found" };

    expect(states({ ...status(broken), elf_built: false })).toEqual([
      "failed",
      "failed",
      "failed",
      "failed",
      "planned",
    ]);
  });

  it("waits on every step before the first run, and runs from the build while one is going", () => {
    expect(states(status(null))).toEqual(["pending", "pending", "pending", "pending", "planned"]);
    expect(states(undefined, true)[0]).toBe("running");
    expect(smokeVerdict(null)).toBe("never");
  });
});
