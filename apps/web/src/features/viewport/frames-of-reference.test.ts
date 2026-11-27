import { describe, expect, it } from "vite-plus/test";

import {
  frdSizeToScene,
  frdToScene,
  nedToScene,
  quaternionToScene,
  rotate,
} from "./frames-of-reference.ts";
import type { Triple } from "./frames-of-reference.ts";

const rounded = (vector: Triple) => vector.map((value) => Math.round(value * 1e6) / 1e6 + 0);

const DEG = Math.PI / 180;

const fromYaw = (degrees: number) =>
  [Math.cos((degrees * DEG) / 2), 0, 0, Math.sin((degrees * DEG) / 2)] as const;

const fromRoll = (degrees: number) =>
  [Math.cos((degrees * DEG) / 2), Math.sin((degrees * DEG) / 2), 0, 0] as const;

describe("frames of reference", () => {
  it("puts north into the screen, east to the right and down below the floor", () => {
    expect(rounded(nedToScene(1, 0, 0))).toEqual(rounded([0, 0, -1]));
    expect(rounded(nedToScene(0, 1, 0))).toEqual(rounded([1, 0, 0]));
    expect(rounded(nedToScene(0, 0, -1.2))).toEqual(rounded([0, 1.2, 0]));
  });

  it("maps a front-right rotor of the body to the front-right of the model", () => {
    expect(rounded(frdToScene([0.0345, 0.0347, -0.001]))).toEqual(
      rounded([0.0347, 0.001, -0.0345]),
    );
    expect(rounded(frdSizeToScene([0.052, 0.031, 0.012]))).toEqual(rounded([0.031, 0.012, 0.052]));
  });

  it("turns the nose from north to east for a 90 degree yaw, as seen from above", () => {
    const [w, x, y, z] = fromYaw(90);
    const nose = rotate(quaternionToScene(w, x, y, z), frdToScene([1, 0, 0]));

    expect(rounded(nose)).toEqual(rounded(nedToScene(0, 1, 0)));
  });

  it("drops the right arm for a positive roll, keeping handedness", () => {
    const [w, x, y, z] = fromRoll(30);
    const rightArm = rotate(quaternionToScene(w, x, y, z), frdToScene([0, 1, 0]));

    expect(rightArm[1]).toBeCloseTo(-Math.sin(30 * DEG), 6);
    expect(rightArm[0]).toBeCloseTo(Math.cos(30 * DEG), 6);
  });
});
