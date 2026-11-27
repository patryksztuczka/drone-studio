import { describe, expect, it } from "vite-plus/test";

import { clock, delta, fixed, percent, signed } from "./format.ts";

describe("format", () => {
  it("prints a flight clock as minutes, seconds and hundredths", () => {
    expect(clock(0)).toBe("00:00.00");
    expect(clock(4.5)).toBe("00:04.50");
    expect(clock(75.256)).toBe("01:15.26");
  });

  it("signs a value with a real minus sign and shows non-finite values as zero", () => {
    expect(signed(-1.25, 2)).toBe("−1.25");
    expect(signed(0.5)).toBe("+0.5");
    expect(fixed(Number.NaN)).toBe("0.0");
    expect(fixed(-0.001, 2)).toBe("0.00");
    expect(signed(-0.001, 1)).toBe("+0.0");
  });

  it("prints fractions as percent and deltas against a baseline", () => {
    expect(percent(0.243)).toBe("24%");
    expect(delta(4.47, 4.11, 2)).toBe("+0.36");
  });
});
