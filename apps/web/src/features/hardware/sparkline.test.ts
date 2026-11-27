import { SampleTable } from "@drone-studio/engine-client";
import { describe, expect, it } from "vite-plus/test";

import { recentValues, sparkPath } from "./sparkline.ts";

const ramp = () => {
  const table = new SampleTable(["t", "imu_az"]);

  for (let row = 0; row <= 100; row += 1) table.append(Float32Array.of(row / 10, row));

  return table;
};

describe("sensor sparkline", () => {
  it("samples the seconds before the playhead", () => {
    const values = recentValues(ramp(), "imu_az", 5, 2, 3);

    expect(values[0]).toBeCloseTo(30);
    expect(values[2]).toBeCloseTo(50);
  });

  it("has nothing to draw without the column or a flight", () => {
    expect(recentValues(ramp(), "baro_pa", 5, 2, 3)).toEqual([]);
    expect(recentValues(new SampleTable(["t", "imu_az"]), "imu_az", 5, 2, 3)).toEqual([]);
  });

  it("stretches the values between the top and the bottom of the box", () => {
    expect(sparkPath([0, 10], 100, 36)).toBe("M0.0 34.0L100.0 2.0");
  });

  it("draws a flat centre line when there is nothing to show", () => {
    expect(sparkPath([], 100, 36)).toBe("M0 18H100");
  });
});
