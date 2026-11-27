import type { Triple } from "./frames-of-reference.ts";

export const DRONE_SPAN_M = 0.14;

export const ISOMETRIC_DIRECTION: Triple = [1, 1, 1];

export const fitZoom = (width: number, height: number) =>
  Math.max(Math.min(width / (DRONE_SPAN_M * 2.1), height / DRONE_SPAN_M), 1);

export const FRAMING_FLOOR = 0.35;

export interface Framing {
  readonly centre: Triple;
  readonly zoom: number;
}

export const frameAll = (points: ReadonlyArray<Triple>, width: number, height: number): Framing => {
  const fit = fitZoom(width, height);

  if (points.length === 0) return { centre: [0, 0, 0], zoom: fit };

  const mean = (axis: 0 | 1 | 2) =>
    points.reduce((sum, point) => sum + point[axis], 0) / points.length;

  const centre: Triple = [mean(0), mean(1), mean(2)];

  const reach = Math.max(
    ...points.map((point) =>
      Math.hypot(point[0] - centre[0], point[1] - centre[1], point[2] - centre[2]),
    ),
  );

  const needed = Math.min(
    width / (DRONE_SPAN_M * 2.1 + 2 * reach),
    height / (DRONE_SPAN_M + 2 * reach),
  );

  const floor = fit * FRAMING_FLOOR;

  if (needed < floor) return { centre: points[0] ?? centre, zoom: fit };

  return { centre, zoom: Math.min(fit, needed) };
};
