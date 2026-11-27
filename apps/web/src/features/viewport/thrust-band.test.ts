import { describe, expect, it } from "vite-plus/test";

import { thrustBand } from "./thrust-band.ts";

describe("thrustBand", () => {
  it("splits motor commands at 55 % and 80 % like the legend under the viewport", () => {
    expect(thrustBand(0.48)).toBe("low");
    expect(thrustBand(0.55)).toBe("mid");
    expect(thrustBand(0.62)).toBe("mid");
    expect(thrustBand(0.8)).toBe("mid");
    expect(thrustBand(0.81)).toBe("high");
  });
});
