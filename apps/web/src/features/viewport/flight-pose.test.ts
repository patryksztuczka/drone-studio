import { SampleTable } from "@drone-studio/engine-client";
import { describe, expect, it } from "vite-plus/test";

import { poseAt } from "./flight-pose.ts";

const columns = [
  "t",
  "pos_n",
  "pos_e",
  "pos_d",
  "q_w",
  "q_x",
  "q_y",
  "q_z",
  "rpm_1",
  "thrust_1",
  "arm_state",
];

const table = () => {
  const samples = new SampleTable(columns);

  samples.append(Float32Array.of(0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0));
  samples.append(Float32Array.of(1, 2, 1, -1, 1, 0, 0, 0, 20000, 0.3, 1));

  return samples;
};

describe("poseAt", () => {
  it("interpolates the position between samples and maps it to the scene", () => {
    const pose = poseAt(table(), 0.5);

    expect(pose.position[0]).toBeCloseTo(0.5);
    expect(pose.position[1]).toBeCloseTo(0.5);
    expect(pose.position[2]).toBeCloseTo(-1);
  });

  it("reads rotor channels it has and zeroes the ones it lacks", () => {
    const pose = poseAt(table(), 1);

    expect(pose.rpm).toEqual([20000, 0, 0, 0]);
    expect(pose.thrust[0]).toBeCloseTo(0.3);
    expect(pose.armed).toBe(true);
  });

  it("falls back to a level attitude when the quaternion columns are missing", () => {
    const pose = poseAt(new SampleTable(["t"]), 0);

    expect(pose.setpoint).toEqual({ x: 0, y: 0, z: 0, w: 1 });
  });
});
