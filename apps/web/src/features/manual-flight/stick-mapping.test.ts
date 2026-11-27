import { describe, expect, it } from "vite-plus/test";

import {
  deadzone,
  padEdges,
  RESTING_STICKS,
  sticksFromKeys,
  sticksFromPad,
  withEdges,
} from "./stick-mapping.ts";

const pad = (axes: ReadonlyArray<number>, buttons: ReadonlyArray<boolean> = []) => ({
  layout: "standard" as const,
  axes,
  buttons,
});

describe("stick mapping", () => {
  it("ignores stick noise inside the dead zone and rescales the rest", () => {
    expect(deadzone(0.05)).toBe(0);
    expect(deadzone(1)).toBe(1);
    expect(deadzone(-0.53)).toBeCloseTo(-0.5);
  });

  it("maps a standard pad in mode 2: left stick throttle and yaw, right stick roll and pitch", () => {
    const centred = sticksFromPad(pad([0, 0, 0, 0]), RESTING_STICKS);

    expect(centred.throttle).toBe(0.5);

    const pushed = sticksFromPad(pad([1, -1, 1, -1]), RESTING_STICKS);

    expect(pushed.yaw).toBe(1);
    expect(pushed.throttle).toBe(1);
    expect(pushed.roll).toBe(1);
    expect(pushed.pitch).toBe(1);
  });

  it("reads an RC transmitter as AETR with an absolute throttle axis", () => {
    const sticks = sticksFromPad(
      { layout: "rc", axes: [0, 0, -1, 0], buttons: [] },
      RESTING_STICKS,
    );

    expect(sticks.throttle).toBe(0);
  });

  it("toggles arm and mode only on the press, not while the button is held", () => {
    const first = padEdges(pad([], [true, false, false, true]), pad([], []));
    const held = padEdges(pad([], [true, false, false, true]), pad([], [true, false, false, true]));

    expect(first).toEqual({ arm: true, mode: true });
    expect(held).toEqual({ arm: false, mode: false });
    expect(withEdges(RESTING_STICKS, first)).toMatchObject({ arm: true, mode: "angle" });
  });

  it("springs the keyboard throttle back to hover in altitude hold", () => {
    const climbing = sticksFromKeys(new Set(["w"]), RESTING_STICKS, 1);

    expect(climbing.throttle).toBeCloseTo(0.85);
    expect(sticksFromKeys(new Set(), climbing, 1).throttle).toBeCloseTo(0.5);
  });

  it("slews keyboard roll and pitch instead of jumping to full deflection", () => {
    const tilted = sticksFromKeys(new Set(["ArrowUp", "ArrowRight"]), RESTING_STICKS, 0.05);

    expect(tilted.pitch).toBeCloseTo(0.2);
    expect(tilted.roll).toBeCloseTo(0.2);
    expect(sticksFromKeys(new Set(["ArrowUp", "Shift"]), RESTING_STICKS, 1).pitch).toBeCloseTo(0.9);
  });
});
