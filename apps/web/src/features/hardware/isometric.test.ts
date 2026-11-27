import { describe, expect, it } from "vite-plus/test";

import { fitBoard, isoBlock, isoCircleRadii, isoPoint } from "./isometric.ts";

const frame = { cx: 380, cy: 203, scale: 17 };

describe("isometric board projection", () => {
  it("draws a 25.5 mm board as the diamond of the mockup", () => {
    const left = isoPoint(frame, -12.75, -12.75, 0);
    const right = isoPoint(frame, 12.75, 12.75, 0);

    expect(right.x - left.x).toBeCloseTo(750.8, 0);
    expect(right.y).toBeCloseTo(203);
    expect(isoPoint(frame, 12.75, -12.75, 0).y).toBeCloseTo(203 - 216.75);
    expect(isoPoint(frame, -12.75, 12.75, 0).y).toBeCloseTo(203 + 216.75);
  });

  it("lifts a point by the board scale per millimetre of height", () => {
    expect(isoPoint(frame, 0, 0, 1.6).y).toBeCloseTo(203 - 27.2);
  });

  it("turns a 1.6 mm hole into the 33 by 19 px ellipse of the mockup", () => {
    const radii = isoCircleRadii(frame, 1.6);

    expect(radii.rx).toBeCloseTo(33.3, 0);
    expect(radii.ry).toBeCloseTo(19.2, 0);
  });

  it("closes the three visible faces of a block", () => {
    const block = isoBlock(frame, [0, 0], [14, 14], 1.2, 1);

    for (const face of [block.top, block.left, block.right]) {
      expect(face.startsWith("M")).toBe(true);
      expect(face.endsWith("Z")).toBe(true);
      expect(face.split("L")).toHaveLength(4);
    }
  });

  it("fits the board to whichever side of the stage runs out first", () => {
    expect(fitBoard(25.5, 1.2, 760, 2000)).toBeCloseTo(17.2, 1);
    expect(fitBoard(25.5, 1.2, 2000, 267)).toBeCloseTo(10, 1);
  });
});
