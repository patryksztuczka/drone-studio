import { describe, expect, it } from "@effect/vitest";

import { SampleTable } from "./sample-table.ts";

const table = () => {
  const samples = new SampleTable(["t", "height"], 2);

  for (const [t, height] of [
    [0, 0],
    [0.5, 1],
    [1, 2],
    [1.5, 2.5],
  ] as const) {
    samples.append(Float32Array.of(t, height));
  }

  return samples;
};

describe("SampleTable", () => {
  it("grows past its first capacity and keeps every row", () => {
    const samples = table();

    expect(samples.length).toBe(4);
    expect([...samples.column("height")]).toEqual([0, 1, 2, 2.5]);
    expect(samples.startTime).toBe(0);
    expect(samples.endTime).toBe(1.5);
  });

  it("finds the last row at or before a time, clamped to the ends", () => {
    const samples = table();

    expect(samples.rowAt(-3)).toBe(0);
    expect(samples.rowAt(0.49)).toBe(0);
    expect(samples.rowAt(0.5)).toBe(1);
    expect(samples.rowAt(1.2)).toBe(2);
    expect(samples.rowAt(9)).toBe(3);
  });

  it("interpolates a channel between rows and holds the last value past the end", () => {
    const samples = table();

    expect(samples.sample("height", 0.25)).toBeCloseTo(0.5);
    expect(samples.sample("height", 1.25)).toBeCloseTo(2.25);
    expect(samples.sample("height", 4)).toBe(2.5);
  });

  it("answers NaN and an empty column for a channel it does not have", () => {
    const samples = table();

    expect(samples.has("motor_1")).toBe(false);
    expect(samples.sample("motor_1", 1)).toBeNaN();
    expect(samples.column("motor_1").length).toBe(0);
  });

  it("builds from the columns runs.load returns, with t first", () => {
    const loaded = SampleTable.fromColumns([0, 0.01], { roll: [1, 2], t: [9, 9] });

    expect(loaded.columns).toEqual(["t", "roll"]);
    expect([...loaded.column("t")]).toEqual([0, 0.009999999776482582]);
    expect(loaded.value("roll", 1)).toBe(2);
  });
});
