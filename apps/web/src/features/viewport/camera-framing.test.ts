import { describe, expect, it } from "vite-plus/test";

import { DRONE_SPAN_M, FRAMING_FLOOR, fitZoom, frameAll } from "./camera-framing.ts";

describe("camera framing", () => {
  it("fits the drone to the shorter side of the viewport", () => {
    expect(fitZoom(1440, 676)).toBeCloseTo(676 / DRONE_SPAN_M);
    expect(fitZoom(400, 900)).toBeCloseTo(400 / (DRONE_SPAN_M * 2.1));
  });

  it("keeps the close-up zoom while two drones fit on screen", () => {
    const framing = frameAll(
      [
        [0, 1, 0],
        [0, 1.02, 0],
      ],
      1440,
      676,
    );

    expect(framing.centre[1]).toBeCloseTo(1.01);
    expect(framing.zoom).toBeGreaterThan(fitZoom(1440, 676) * 0.85);
  });

  it("zooms out until a baseline a few decimetres away stays in view", () => {
    const framing = frameAll(
      [
        [0, 1.5, 0],
        [0, 1.3, 0],
      ],
      1440,
      676,
    );

    expect(framing.centre[1]).toBeCloseTo(1.4);
    expect(framing.zoom * (0.2 + DRONE_SPAN_M)).toBeCloseTo(676);
  });

  it("stops zooming out and stays on the candidate when the baseline is metres away", () => {
    const framing = frameAll(
      [
        [0, 5.5, 0],
        [0, 1.3, 0],
      ],
      1440,
      676,
    );

    expect(framing.centre).toEqual([0, 5.5, 0]);
    expect(framing.zoom).toBeCloseTo(fitZoom(1440, 676) * FRAMING_FLOOR);
  });
});
