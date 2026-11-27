import { SampleTable } from "@drone-studio/engine-client";
import { describe, expect, it } from "vite-plus/test";

import { commandHistory, leadingMotors, meanCommand } from "./motor-history.ts";

const spinUp = () => {
  const table = new SampleTable(["t", "motor_1", "motor_2", "motor_3", "motor_4"]);

  for (let row = 0; row <= 20; row += 1) {
    const command = row / 20;

    table.append(Float32Array.of(row / 10, command, command, command, command * 0.5));
  }

  return table;
};

describe("motor history", () => {
  it("averages the four motor commands", () => {
    expect(meanCommand(spinUp(), 2)).toBeCloseTo(0.875);
  });

  it("keeps one bar per step back from the playhead and zero before the flight", () => {
    const bars = commandHistory(spinUp(), 0.2, 4, 0.1);

    expect(bars[0]).toBe(0);
    expect(bars[3]).toBeCloseTo(0.0875);
    expect(bars).toHaveLength(4);
  });

  it("marks the motors pushing harder than the average", () => {
    expect(leadingMotors([0.27, 0.24, 0.31, 0.34])).toEqual([false, false, true, true]);
  });
});
