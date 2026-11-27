export type Triple = readonly [number, number, number];

export interface SceneQuaternion {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

export const nedToScene = (north: number, east: number, down: number): Triple => [
  east,
  -down,
  -north,
];

export const frdToScene = (position: Triple): Triple =>
  nedToScene(position[0], position[1], position[2]);

export const frdSizeToScene = (size: Triple): Triple => [size[1], size[2], size[0]];

export const quaternionToScene = (w: number, x: number, y: number, z: number): SceneQuaternion => ({
  x: y,
  y: -z,
  z: -x,
  w,
});

export const rotate = (q: SceneQuaternion, v: Triple): Triple => {
  const [vx, vy, vz] = v;
  const tx = 2 * (q.y * vz - q.z * vy);
  const ty = 2 * (q.z * vx - q.x * vz);
  const tz = 2 * (q.x * vy - q.y * vx);

  return [
    vx + q.w * tx + (q.y * tz - q.z * ty),
    vy + q.w * ty + (q.z * tx - q.x * tz),
    vz + q.w * tz + (q.x * ty - q.y * tx),
  ];
};
