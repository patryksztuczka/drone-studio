import { SampleTable } from "@drone-studio/engine-client";
import { describe, expect, it } from "vite-plus/test";

import { plotY, seriesPath, valueRange } from "./timeline-plot.ts";

const climb = (seconds: number, top: number) => {
  const table = new SampleTable(["t", "height"]);

  for (let row = 0; row <= seconds * 10; row += 1) {
    table.append(Float32Array.of(row / 10, Math.min(row / 10, top)));
  }

  return table;
};

const box = { width: 200, top: 24, bottom: 88 };

describe("timeline plot", () => {
  it("scales both runs of a comparison to one range that starts at the floor", () => {
    const range = valueRange([climb(10, 2), climb(10, 5)], "height", 10);

    expect(range.min).toBe(0);
    expect(range.max).toBeCloseTo(5.3);
  });

  it("ignores samples after the playhead of a live session and tables without the column", () => {
    const range = valueRange([climb(10, 8), new SampleTable(["t"])], "height", 3);

    expect(range.max).toBeCloseTo(3.18);
  });

  it("keeps a flat line on the floor instead of dividing by zero", () => {
    expect(valueRange([climb(4, 0)], "height", 4)).toEqual({ min: 0, max: 0.5 });
  });

  it("maps the floor to the bottom of the plot and the top of the range to its top", () => {
    const range = { min: 0, max: 4 };

    expect(plotY(0, range, box)).toBe(88);
    expect(plotY(4, range, box)).toBe(24);
    expect(plotY(9, range, box)).toBe(24);
    expect(plotY(Number.NaN, range, box)).toBe(88);
  });

  it("draws a line across the recorded part of the span only", () => {
    const path = seriesPath(climb(5, 3), "height", { start: 0, end: 10 }, { min: 0, max: 3 }, box);

    expect(path.startsWith("M0.0 88.0")).toBe(true);
    expect(path.endsWith("L100.0 24.0")).toBe(true);
    expect(
      seriesPath(new SampleTable(["t"]), "height", { start: 0, end: 1 }, { min: 0, max: 1 }, box),
    ).toBe("");
  });
});
