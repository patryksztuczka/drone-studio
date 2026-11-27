import { SampleTable } from "@drone-studio/engine-client";
import { describe, expect, it } from "vite-plus/test";

import { chartWindow, columnsIn } from "./chart-window.ts";

const table = (seconds: number, rate: number) => {
  const samples = new SampleTable(["t", "roll"]);

  for (let row = 0; row <= seconds * rate; row += 1)
    samples.append(Float32Array.of(row / rate, row));

  return samples;
};

describe("chart window", () => {
  it("shows a whole recorded run", () => {
    expect(chartWindow(table(10, 10), false, 3)).toEqual({ min: 0, max: 10 });
  });

  it("scrolls a live session so the last twelve seconds end at the cursor", () => {
    expect(chartWindow(table(30, 10), true, 30)).toEqual({ min: 18, max: 30 });
    expect(chartWindow(table(4, 10), true, 4)).toEqual({ min: 0, max: 12 });
  });

  it("slices the columns inside the window without copying them", () => {
    const [time, roll] = columnsIn(table(10, 10), { min: 2, max: 3 }, ["t", "roll"]);

    expect(time?.[0]).toBeCloseTo(2);
    expect(roll?.length).toBe(12);
  });
});
