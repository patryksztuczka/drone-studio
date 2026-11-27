import type { BoardLayout, LayoutPad } from "@drone-studio/engine-client";

import type { Highlight } from "../board-geometry.ts";
import { padEdge } from "../board-geometry.ts";
import { isoBlock, isoCircleRadii, isoPoint } from "../isometric.ts";
import type { IsoFrame } from "../isometric.ts";

export type BoardTone = "blue" | "amber";

export type BoardPart = string;

interface Swatch {
  readonly stroke: string;
  readonly top: string;
  readonly right: string;
  readonly left: string;
  readonly pad: string;
  readonly padLit: string;
  readonly chip: readonly [string, string, string];
  readonly part: readonly [string, string, string];
  readonly selected: string;
  readonly trace: string;
}

const SWATCHES: Readonly<Record<BoardTone, Swatch>> = {
  blue: {
    stroke: "#0a6cff",
    top: "#7cc4ff59",
    right: "#7cc4ff80",
    left: "#7cc4ff66",
    pad: "#0a6cff80",
    padLit: "#0a6cff",
    chip: ["#0a6cffbf", "#0a6cffd9", "#0a6cffad"],
    part: ["#7cc4ff99", "#7cc4ffb3", "#7cc4ff8f"],
    selected: "#e6f4ff",
    trace: "#0a6cff8c",
  },
  amber: {
    stroke: "#d97706",
    top: "#fbd5a566",
    right: "#fbc98a99",
    left: "#fbc98a80",
    pad: "#e58a0080",
    padLit: "#e58a00",
    chip: ["#d9762acc", "#c8651ce0", "#d9762ab3"],
    part: ["#fbc98ab3", "#f6a957c0", "#fbc98a99"],
    selected: "#fff4e0",
    trace: "#e58a008c",
  },
};

const PAD_LIFT_MM = 0.04;

const padSize = (pad: LayoutPad): readonly [number, number] => {
  const edge = padEdge(pad.x_mm, pad.y_mm);
  const wide = pad.kind === "motor" || pad.kind === "power" || pad.kind === "usb";
  const long = wide ? 2.4 : 1.6;
  const short = wide ? 1.7 : 1.1;

  if (pad.kind === "motor") return [2.4, 2.4];

  return edge === "front" || edge === "rear" ? [short, long] : [long, short];
};

const PART_HEIGHT_MM: ReadonlyMap<string, number> = new Map([
  ["imu", 0.9],
  ["barometer", 0.8],
]);

const MCU_HEIGHT_MM = 1;

interface IsoBoardProps {
  readonly board: BoardLayout["board"];
  readonly frame: IsoFrame;
  readonly tone: BoardTone;
  readonly lit?: Highlight | undefined;
  readonly selected?: BoardPart | undefined;
  readonly onSelect?: (part: BoardPart) => void;
  readonly onPad?: (pad: LayoutPad | undefined) => void;
}

export const partTop = (board: BoardLayout["board"], frame: IsoFrame, part: BoardPart) => {
  const base = board.thickness_mm / 2;

  if (part === "mcu") {
    return isoPoint(
      frame,
      board.mcu.position_mm[0],
      board.mcu.position_mm[1],
      base + MCU_HEIGHT_MM,
    );
  }

  const device = board.devices.find((candidate) => candidate.id === part);

  if (device === undefined) return isoPoint(frame, 0, 0, base);

  return isoPoint(
    frame,
    device.position_mm[0],
    device.position_mm[1],
    base + (PART_HEIGHT_MM.get(device.type) ?? 0.8),
  );
};

export const IsoBoard = ({ board, frame, tone, lit, selected, onSelect, onPad }: IsoBoardProps) => {
  const swatch = SWATCHES[tone];
  const thickness = board.thickness_mm;
  const top = thickness / 2;
  const slab = isoBlock(frame, [0, 0], board.size_mm, -thickness / 2, thickness);
  const mcu = board.mcu;
  const chip = isoBlock(frame, mcu.position_mm, mcu.size_mm, top, MCU_HEIGHT_MM);
  const anyLit = lit !== undefined && lit.pads.size > 0;
  const hole = isoCircleRadii(frame, 1.6);
  const mcuCentre = isoPoint(frame, mcu.position_mm[0], mcu.position_mm[1], top);
  const chipFront = mcu.position_mm[0] - mcu.size_mm[0] / 2;
  const chipRight = mcu.position_mm[1] + mcu.size_mm[1] / 2;
  const pins = Array.from({ length: 14 }, (_, index) => -0.42 + (index * 0.84) / 13);

  const devices = [...board.devices].sort(
    (a, b) => a.position_mm[1] - a.position_mm[0] - (b.position_mm[1] - b.position_mm[0]),
  );

  const interactive = onSelect !== undefined;

  return (
    <g strokeLinejoin="round">
      <path d={slab.right} fill={swatch.right} stroke={swatch.stroke} />
      <path d={slab.left} fill={swatch.left} stroke={swatch.stroke} />
      <path d={slab.top} fill={swatch.top} stroke={swatch.stroke} />
      {board.devices.map((device) => {
        const end = isoPoint(frame, device.position_mm[0], device.position_mm[1], top);
        const bend = isoPoint(frame, device.position_mm[0], mcu.position_mm[1], top);
        const on = lit?.devices.has(device.id) === true;

        return (
          <path
            key={`trace-${device.id}`}
            d={`M${mcuCentre.x.toFixed(1)} ${mcuCentre.y.toFixed(1)}L${bend.x.toFixed(1)} ${bend.y.toFixed(1)}L${end.x.toFixed(1)} ${end.y.toFixed(1)}`}
            fill="none"
            stroke={on ? swatch.padLit : swatch.trace}
            strokeWidth={on ? 1.6 : 1.2}
            strokeDasharray={on ? "4 3" : undefined}
          />
        );
      })}
      {board.pads.map((pad) => {
        const face = isoBlock(frame, [pad.x_mm, pad.y_mm], padSize(pad), top, PAD_LIFT_MM);
        const on = lit?.pads.has(pad.id) === true;

        return (
          <path
            key={pad.id}
            d={face.top}
            fill={on ? swatch.padLit : swatch.pad}
            stroke={swatch.stroke}
            strokeWidth={0.8}
            opacity={anyLit && !on ? 0.35 : 1}
            role={onPad === undefined ? undefined : "img"}
            aria-label={onPad === undefined ? undefined : `${pad.label} pad, net ${pad.net}`}
            onPointerEnter={onPad === undefined ? undefined : () => onPad(pad)}
            onPointerLeave={onPad === undefined ? undefined : () => onPad(undefined)}
            className={onPad === undefined ? undefined : "cursor-crosshair"}
          />
        );
      })}
      {board.mounting_holes_mm.map(([forward, right]) => {
        const centre = isoPoint(frame, forward, right, top);

        return (
          <ellipse
            key={`${String(forward)}:${String(right)}`}
            cx={centre.x}
            cy={centre.y}
            rx={hole.rx}
            ry={hole.ry}
            fill="#fafafa"
            stroke={swatch.stroke}
          />
        );
      })}
      <g
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-label={interactive ? mcu.name : undefined}
        aria-pressed={interactive ? selected === "mcu" : undefined}
        onClick={interactive ? () => onSelect("mcu") : undefined}
        className={interactive ? "cursor-pointer outline-none" : undefined}
      >
        <path d={chip.right} fill={swatch.chip[1]} stroke={swatch.stroke} />
        <path d={chip.left} fill={swatch.chip[2]} stroke={swatch.stroke} />
        <path
          d={chip.top}
          fill={selected === "mcu" ? swatch.selected : swatch.chip[0]}
          stroke={swatch.stroke}
          strokeWidth={selected === "mcu" ? 1.6 : 1}
        />
        <path
          d={pins
            .flatMap((fraction) => {
              const along = mcu.position_mm[0] + fraction * mcu.size_mm[0];
              const across = mcu.position_mm[1] + fraction * mcu.size_mm[1];
              const a = isoPoint(frame, along, chipRight, top + 0.2);
              const b = isoPoint(frame, along, chipRight + 0.7, top);
              const c = isoPoint(frame, chipFront, across, top + 0.2);
              const d = isoPoint(frame, chipFront - 0.7, across, top);

              return [
                `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
                `M${c.x.toFixed(1)} ${c.y.toFixed(1)}L${d.x.toFixed(1)} ${d.y.toFixed(1)}`,
              ];
            })
            .join("")}
          stroke={swatch.stroke}
        />
      </g>
      {devices.map((device) => {
        const height = PART_HEIGHT_MM.get(device.type) ?? 0.8;
        const block = isoBlock(frame, device.position_mm, device.size_mm, top, height);
        const chosen = selected === device.id;
        const on = lit?.devices.has(device.id) === true;

        return (
          <g
            key={device.id}
            role={interactive ? "button" : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-label={interactive ? device.name : undefined}
            aria-pressed={interactive ? chosen : undefined}
            onClick={interactive ? () => onSelect(device.id) : undefined}
            className={interactive ? "cursor-pointer outline-none" : undefined}
          >
            <path d={block.right} fill={swatch.part[1]} stroke={swatch.stroke} />
            <path d={block.left} fill={swatch.part[2]} stroke={swatch.stroke} />
            <path
              d={block.top}
              fill={chosen || on ? swatch.selected : swatch.part[0]}
              stroke={swatch.stroke}
              strokeWidth={chosen ? 1.6 : 1}
            />
          </g>
        );
      })}
    </g>
  );
};
