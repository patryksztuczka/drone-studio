export interface IsoFrame {
  readonly cx: number;
  readonly cy: number;
  readonly scale: number;
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

const COS30 = Math.cos(Math.PI / 6);

export const isoPoint = (
  frame: IsoFrame,
  forwardMm: number,
  rightMm: number,
  upMm: number,
): ScreenPoint => {
  const u = rightMm;
  const v = -forwardMm;

  return {
    x: frame.cx + (u - v) * COS30 * frame.scale,
    y: frame.cy + (u + v) * 0.5 * frame.scale - upMm * frame.scale,
  };
};

const polygon = (points: ReadonlyArray<ScreenPoint>) =>
  `M${points.map((point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join("L")}Z`;

export interface IsoBlock {
  readonly top: string;
  readonly right: string;
  readonly left: string;
}

export const isoBlock = (
  frame: IsoFrame,
  centre: readonly [number, number],
  size: readonly [number, number],
  base: number,
  height: number,
): IsoBlock => {
  const [forward, right] = centre;
  const [length, width] = size;
  const front = forward + length / 2;
  const rear = forward - length / 2;
  const leftSide = right - width / 2;
  const rightSide = right + width / 2;
  const top = base + height;
  const at = (f: number, r: number, up: number) => isoPoint(frame, f, r, up);

  return {
    top: polygon([
      at(front, leftSide, top),
      at(front, rightSide, top),
      at(rear, rightSide, top),
      at(rear, leftSide, top),
    ]),
    right: polygon([
      at(front, rightSide, top),
      at(rear, rightSide, top),
      at(rear, rightSide, base),
      at(front, rightSide, base),
    ]),
    left: polygon([
      at(rear, leftSide, top),
      at(rear, rightSide, top),
      at(rear, rightSide, base),
      at(rear, leftSide, base),
    ]),
  };
};

export const isoCircleRadii = (frame: IsoFrame, radiusMm: number) => ({
  rx: radiusMm * frame.scale * Math.SQRT2 * COS30,
  ry: radiusMm * frame.scale * Math.SQRT2 * 0.5,
});

export const fitBoard = (
  boardMm: number,
  thicknessMm: number,
  width: number,
  height: number,
): number => Math.max(Math.min(width / (2 * boardMm * COS30), height / (boardMm + thicknessMm)), 1);
