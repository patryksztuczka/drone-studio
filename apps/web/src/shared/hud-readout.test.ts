import { SampleTable } from "@drone-studio/engine-client";
import { describe, expect, it } from "vite-plus/test";

import { hudReadout, separation } from "./hud-readout.ts";

const columns = [
  "t",
  "height",
  "vel_n",
  "vel_e",
  "vel_d",
  "wind_n",
  "wind_e",
  "wind_d",
  "arm_state",
  "status",
];

const single = (values: ReadonlyArray<number>) => {
  const table = new SampleTable(columns);

  table.append(Float32Array.from(values));

  return table;
};

describe("hudReadout", () => {
  it("reports climb as positive up and ground speed from the horizontal velocity", () => {
    const readout = hudReadout(single([1, 1.2, 3, 4, -0.5, 0, 0, 0, 1, 3]), 1);

    expect(readout.climb).toBeCloseTo(0.5);
    expect(readout.groundSpeed).toBeCloseTo(5);
    expect(readout.arm).toBe("ARMED");
    expect(readout.altitudeHold).toBe(true);
  });

  it("names where the wind blows from, as a compass bearing", () => {
    const fromWest = hudReadout(single([0, 0, 0, 0, 0, 0, 6, 0, 0, 0]), 0);

    expect(fromWest.windFrom).toBeCloseTo(270);
    expect(fromWest.wind).toBeCloseTo(6);
    expect(fromWest.arm).toBe("DISARMED");
  });

  it("calls an arm state of two a failsafe", () => {
    expect(hudReadout(single([0, 0, 0, 0, 0, 0, 0, 0, 2, 0]), 0).arm).toBe("FAILSAFE");
  });
});

describe("separation", () => {
  it("measures how far the ghost run is from the open run at the same moment", () => {
    const open = new SampleTable(["t", "pos_n", "pos_e", "pos_d", "roll", "pitch"]);
    const ghost = new SampleTable(["t", "pos_n", "pos_e", "pos_d", "roll", "pitch"]);

    open.append(Float32Array.of(1, 3, 4, -1, 10, 0));
    ghost.append(Float32Array.of(1, 0, 0, -1, 4, 0));

    expect(separation(open, ghost, 1)).toEqual({ distance: 5, roll: 6, pitch: 0 });
  });
});
