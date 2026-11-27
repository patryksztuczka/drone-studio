import type { SampleTable } from "@drone-studio/engine-client";

import { nedToScene, quaternionToScene } from "./frames-of-reference.ts";
import type { SceneQuaternion, Triple } from "./frames-of-reference.ts";

export interface FlightPose {
  readonly t: number;
  readonly position: Triple;
  readonly attitude: SceneQuaternion;
  readonly setpoint: SceneQuaternion;
  readonly rpm: readonly [number, number, number, number];
  readonly thrust: readonly [number, number, number, number];
  readonly motor: readonly [number, number, number, number];
  readonly wind: Triple;
  readonly windSpeed: number;
  readonly height: number;
  readonly armed: boolean;
  readonly saturated: boolean;
}

const finite = (value: number) => (Number.isFinite(value) ? value : 0);

const unit = (q: SceneQuaternion): SceneQuaternion => {
  const length = Math.hypot(q.x, q.y, q.z, q.w);

  return length < 1e-9 || !Number.isFinite(length)
    ? { x: 0, y: 0, z: 0, w: 1 }
    : { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
};

const four = (table: SampleTable, prefix: string, t: number) => {
  const read = (index: number) => finite(table.sample(`${prefix}_${String(index)}`, t));

  return [read(1), read(2), read(3), read(4)] as const;
};

export const poseAt = (table: SampleTable, t: number): FlightPose => {
  const read = (name: string) => finite(table.sample(name, t));
  const wind = nedToScene(read("wind_n"), read("wind_e"), read("wind_d"));

  return {
    t,
    position: nedToScene(read("pos_n"), read("pos_e"), read("pos_d")),
    attitude: unit(quaternionToScene(read("q_w"), read("q_x"), read("q_y"), read("q_z"))),
    setpoint: unit(
      quaternionToScene(read("sp_q_w"), read("sp_q_x"), read("sp_q_y"), read("sp_q_z")),
    ),
    rpm: four(table, "rpm", t),
    thrust: four(table, "thrust", t),
    motor: four(table, "motor", t),
    wind,
    windSpeed: Math.hypot(wind[0], wind[1], wind[2]),
    height: read("height"),
    armed: read("arm_state") >= 0.5,
    saturated: read("saturated") >= 0.5,
  };
};

export const IDLE_POSE: FlightPose = {
  t: 0,
  position: [0, 0.0105, 0],
  attitude: { x: 0, y: 0, z: 0, w: 1 },
  setpoint: { x: 0, y: 0, z: 0, w: 1 },
  rpm: [0, 0, 0, 0],
  thrust: [0, 0, 0, 0],
  motor: [0, 0, 0, 0],
  wind: [0, 0, 0],
  windSpeed: 0,
  height: 0,
  armed: false,
  saturated: false,
};
