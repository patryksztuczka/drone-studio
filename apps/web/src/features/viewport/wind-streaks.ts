import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments } from "three";

import type { FlightPose } from "./flight-pose.ts";

const STREAKS = 90;

const HALF_EXTENT = 1.4;

const seeded = (index: number, salt: number) => {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43_758.5453;

  return value - Math.floor(value);
};

const wrap = (value: number) => {
  const span = HALF_EXTENT * 2;

  return ((((value + HALF_EXTENT) % span) + span) % span) - HALF_EXTENT;
};

export class WindStreaks {
  readonly object: LineSegments;
  private readonly offsets: Float32Array;
  private readonly positions: BufferAttribute;
  private readonly geometry: BufferGeometry;
  private readonly material: LineBasicMaterial;

  constructor() {
    this.offsets = Float32Array.from(
      { length: STREAKS * 3 },
      (_, index) => (seeded(Math.floor(index / 3), index % 3) * 2 - 1) * HALF_EXTENT,
    );
    this.positions = new BufferAttribute(new Float32Array(STREAKS * 6), 3);
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute("position", this.positions);
    this.material = new LineBasicMaterial({
      color: "#7dd3fc",
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.object = new LineSegments(this.geometry, this.material);
  }

  update(pose: FlightPose | undefined, dt: number) {
    const speed = pose?.windSpeed ?? 0;

    this.object.visible = pose !== undefined && speed > 0.15;

    if (pose === undefined || !this.object.visible) return;

    this.material.opacity = Math.min(speed / 6, 1) * 0.55;

    const [wx, wy, wz] = pose.wind;
    const step = Math.min(dt, 0.05) * 0.6;
    const tail = 0.05 + Math.min(speed, 8) * 0.025;
    const [cx, cy, cz] = pose.position;

    for (let index = 0; index < STREAKS; index += 1) {
      const base = index * 3;
      const ox = wrap((this.offsets[base] ?? 0) + wx * step);
      const oy = wrap((this.offsets[base + 1] ?? 0) + wy * step);
      const oz = wrap((this.offsets[base + 2] ?? 0) + wz * step);

      this.offsets[base] = ox;
      this.offsets[base + 1] = oy;
      this.offsets[base + 2] = oz;

      const x = cx + ox;
      const y = Math.max(cy + oy * 0.5, 0.02);
      const z = cz + oz;

      this.positions.setXYZ(index * 2, x, y, z);
      this.positions.setXYZ(
        index * 2 + 1,
        x - (wx / speed) * tail,
        y - (wy / speed) * tail,
        z - (wz / speed) * tail,
      );
    }

    this.positions.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
