import type { BoardLayout, LayoutDevice, LayoutPad } from "@drone-studio/engine-client";
import { cn } from "@drone-studio/ui/lib/utils";
import { useAtomValue } from "@effect/atom-react";
import { Option } from "effect";
import { useState } from "react";

import { fixed } from "../../../shared/format.ts";
import { activeFlight, playhead } from "../../../shared/studio.atoms.ts";
import { busDetail, highlightFor, padEdge, padFunction, toBoard } from "../board-geometry.ts";
import type { Selection } from "../board-geometry.ts";

const PAD_COLORS: ReadonlyMap<string, string> = new Map([
  ["motor", "#0a6cff"],
  ["power", "#e5484d"],
  ["uart", "#e58a00"],
  ["usb", "#7c5cff"],
]);

interface DeviceStyle {
  readonly fill: string;
  readonly stroke: string;
  readonly label: string;
}

const DEVICE_STYLES: ReadonlyMap<string, DeviceStyle> = new Map([
  ["imu", { fill: "#eaf2ff", stroke: "#0a6cff", label: "IMU" }],
  ["barometer", { fill: "#f3fbe6", stroke: "#5e9e00", label: "BARO" }],
]);

const FALLBACK_STYLE: DeviceStyle = { fill: "#ffffff", stroke: "#5f5f5f", label: "DEV" };

const GYRO_CALIBRATED = 1 << 0;

const IMU_FAULT = 1 << 7;

const MONO = "Geist Mono Variable, ui-monospace, monospace";

const LABEL_GAP = 0.5;

const padSize = (pad: LayoutPad) => {
  const sideways =
    padEdge(pad.x_mm, pad.y_mm) === "front" || padEdge(pad.x_mm, pad.y_mm) === "rear";

  const wide = pad.kind === "motor" || pad.kind === "power" || pad.kind === "usb";
  const long = wide ? 1.8 : 1.2;
  const short = wide ? 1.2 : 1.5;

  return sideways && pad.kind !== "motor"
    ? { width: short, height: long }
    : { width: long, height: short };
};

type Anchor = "start" | "middle" | "end";

interface LabelPlacement {
  readonly x: number;
  readonly y: number;
  readonly anchor: Anchor;
}

const labelPlacement = (pad: LayoutPad, width: number, height: number): LabelPlacement => {
  const point = toBoard(pad.x_mm, pad.y_mm);
  const edge = padEdge(pad.x_mm, pad.y_mm);

  if (edge === "front")
    return { x: point.x, y: point.y - height / 2 - LABEL_GAP, anchor: "middle" };

  if (edge === "rear") return { x: point.x, y: point.y + height / 2 + 1.4, anchor: "middle" };

  if (edge === "left")
    return { x: point.x - width / 2 - LABEL_GAP, y: point.y + 0.4, anchor: "end" };

  return { x: point.x + width / 2 + LABEL_GAP, y: point.y + 0.4, anchor: "start" };
};

interface PadMarkProps {
  readonly pad: LayoutPad;
  readonly lit: boolean;
  readonly dim: boolean;
  readonly onHover: (selection: Selection | undefined) => void;
}

const PadMark = ({ pad, lit, dim, onHover }: PadMarkProps) => {
  const point = toBoard(pad.x_mm, pad.y_mm);
  const { width, height } = padSize(pad);
  const label = labelPlacement(pad, width, height);

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${pad.label} pad, net ${pad.net}`}
      onPointerEnter={() => onHover({ kind: "pad", id: pad.id })}
      onPointerLeave={() => onHover(undefined)}
      onFocus={() => onHover({ kind: "pad", id: pad.id })}
      onBlur={() => onHover(undefined)}
      className="cursor-pointer outline-none"
      opacity={dim ? 0.35 : 1}
    >
      <rect
        x={point.x - width / 2}
        y={point.y - height / 2}
        width={width}
        height={height}
        rx={0.15}
        fill={PAD_COLORS.get(pad.kind) ?? "#9a9a9a"}
        stroke={lit ? "#111111" : "none"}
        strokeWidth={0.12}
      />
      <text
        x={label.x}
        y={label.y}
        textAnchor={label.anchor}
        fontSize={1.15}
        fill={lit ? "#111111" : "#9a9a9a"}
        fontFamily={MONO}
        pointerEvents="none"
      >
        {pad.label}
      </text>
    </g>
  );
};

interface DeviceMarkProps {
  readonly device: LayoutDevice;
  readonly lit: boolean;
  readonly dim: boolean;
  readonly onHover: (selection: Selection | undefined) => void;
}

const DeviceMark = ({ device, lit, dim, onHover }: DeviceMarkProps) => {
  const point = toBoard(device.position_mm[0], device.position_mm[1]);
  const width = device.size_mm[1];
  const height = device.size_mm[0];
  const style = DEVICE_STYLES.get(device.type) ?? FALLBACK_STYLE;

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={device.name}
      onPointerEnter={() => onHover({ kind: "device", id: device.id })}
      onPointerLeave={() => onHover(undefined)}
      onFocus={() => onHover({ kind: "device", id: device.id })}
      onBlur={() => onHover(undefined)}
      className="cursor-pointer outline-none"
      opacity={dim ? 0.35 : 1}
    >
      <rect
        x={point.x - width / 2}
        y={point.y - height / 2}
        width={width}
        height={height}
        rx={0.3}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={lit ? 0.22 : 0.15}
      />
      <text
        x={point.x - width / 2}
        y={point.y + height / 2 + 1.3}
        fontSize={1.15}
        fill={style.stroke}
        fontFamily={MONO}
        pointerEvents="none"
      >
        {style.label}
      </text>
    </g>
  );
};

interface SensorRowProps {
  readonly device: LayoutDevice;
  readonly bus: string;
  readonly reading: string;
  readonly healthy: boolean | undefined;
}

const hex = (value: number) => `0x${value.toString(16).padStart(2, "0")}`;

const SensorRow = ({ device, bus, reading, healthy }: SensorRowProps) => (
  <div className="flex items-center gap-2.5 border-b border-line px-5 py-[9px] last:border-b-0">
    <div className="flex min-w-0 flex-1 flex-col gap-px">
      <p className="truncate text-[12px] leading-4 text-ink">{device.name}</p>
      <p className="truncate font-label text-[10px] leading-3 text-faint">
        {bus}
        {device.chip_select === null ? "" : ` · CS ${device.chip_select}`}
        {device.address === null ? "" : ` · 0x${device.address.toString(16)}`} · WHO_AM_I{" "}
        {hex(device.identity.register)} = {hex(device.identity.value)}
      </p>
    </div>
    <div className="flex flex-col items-end gap-px font-label text-[10px] leading-3">
      <span
        className={cn(healthy === undefined ? "text-faint" : healthy ? "text-ok" : "text-fail")}
      >
        {healthy === undefined ? "IDLE" : healthy ? "STREAMING" : "FAULT"}
      </span>
      <span className="text-muted tabular-nums">{reading}</span>
    </div>
  </div>
);

interface BoardViewProps {
  readonly layout: BoardLayout;
}

export const BoardView = ({ layout }: BoardViewProps) => {
  const [hover, setHover] = useState<Selection | undefined>(undefined);
  const flight = useAtomValue(activeFlight);
  const t = useAtomValue(playhead);
  const board = layout.board;
  const lit = highlightFor(board, hover);
  const half = board.size_mm[0] / 2;
  const mcu = board.mcu;
  const mcuSize = mcu.size_mm[0] * 0.75;
  const anything = hover !== undefined;

  const reading = (column: string) =>
    Option.match(flight, {
      onNone: () => Number.NaN,
      onSome: (view) => view.table.sample(column, t),
    });

  const status = reading("status");
  const streaming = Number.isFinite(status);

  const imuHealthy = streaming
    ? (Math.round(status) & IMU_FAULT) === 0 && (Math.round(status) & GYRO_CALIBRATED) !== 0
    : undefined;

  const hoveredPad =
    hover?.kind === "pad" ? board.pads.find((pad) => pad.id === hover.id) : undefined;

  const shownBus = board.buses.find((bus) => lit.buses.has(bus.id));

  return (
    <div className="flex flex-col">
      <svg
        viewBox={`${String(-half - 6)} ${String(-half - 4)} ${String(half * 2 + 12)} ${String(half * 2 + 6.5)}`}
        className="mx-auto block h-[150px] w-full"
        role="img"
        aria-label={board.name}
      >
        <path
          d={`M-1.5 ${String(-half - 2.3)}L0 ${String(-half - 3.4)}L1.5 ${String(-half - 2.3)}`}
          fill="none"
          stroke="#11111166"
          strokeWidth={0.15}
        />
        <text
          x={0}
          y={-half - 0.9}
          textAnchor="middle"
          fontSize={1.1}
          fill="#9a9a9a"
          fontFamily={MONO}
          pointerEvents="none"
        >
          FRONT
        </text>
        <rect
          x={-half}
          y={-half}
          width={half * 2}
          height={half * 2}
          rx={1.5}
          fill="#f7f9fc"
          stroke="#11111180"
          strokeWidth={0.15}
        />
        {board.mounting_holes_mm.map(([x, y]) => {
          const point = toBoard(x, y);

          return (
            <circle
              key={`${String(x)}-${String(y)}`}
              cx={point.x}
              cy={point.y}
              r={1.05}
              fill="#ffffff"
              stroke="#11111159"
              strokeWidth={0.15}
            />
          );
        })}
        {[...lit.devices].map((deviceId) => {
          const device = board.devices.find((candidate) => candidate.id === deviceId);

          if (device === undefined) return null;

          const point = toBoard(device.position_mm[0], device.position_mm[1]);
          const edge = mcuSize / 2;
          const start = Math.sign(point.x) * edge;

          return (
            <path
              key={`trace-${deviceId}`}
              d={`M${String(start)} ${String(point.y * 0.4)}H${String((start + point.x) / 2)}V${String(point.y)}H${String(point.x)}`}
              fill="none"
              stroke="#0a6cff"
              strokeWidth={0.24}
            />
          );
        })}
        {board.pads.map((pad) => (
          <PadMark
            key={pad.id}
            pad={pad}
            lit={lit.pads.has(pad.id)}
            dim={anything && !lit.pads.has(pad.id)}
            onHover={setHover}
          />
        ))}
        <rect
          x={-mcuSize / 2}
          y={-mcuSize / 2}
          width={mcuSize}
          height={mcuSize}
          rx={0.45}
          fill="#ffffff"
          stroke="#11111199"
          strokeWidth={0.15}
        />
        <text
          x={-mcuSize / 2 + 1.4}
          y={-0.3}
          fontSize={1.35}
          fill="#111111"
          fontFamily={MONO}
          pointerEvents="none"
        >
          {mcu.name.replace(/VIT6$/, "")}
        </text>
        <text
          x={-mcuSize / 2 + 1.4}
          y={1.5}
          fontSize={1.05}
          fill="#9a9a9a"
          fontFamily={MONO}
          pointerEvents="none"
        >
          {mcu.core} · {String(mcu.clock_hz / 1_000_000)} MHz
        </text>
        {board.devices.map((device) => (
          <DeviceMark
            key={device.id}
            device={device}
            lit={lit.devices.has(device.id)}
            dim={anything && !lit.devices.has(device.id)}
            onHover={setHover}
          />
        ))}
      </svg>
      <p
        aria-live="polite"
        className={cn(
          "mx-5 mt-0.5 border px-2.5 py-2 font-label text-[11px] leading-4",
          shownBus !== undefined || hoveredPad !== undefined
            ? "border-blue bg-blue-soft text-ink"
            : "border-line bg-surface text-muted",
        )}
      >
        {shownBus !== undefined && hoveredPad === undefined ? busDetail(shownBus) : null}
        {hoveredPad === undefined
          ? null
          : `${hoveredPad.label} · net ${hoveredPad.net} · ${padFunction(board, hoveredPad)}`}
        {shownBus === undefined && hoveredPad === undefined
          ? `${board.name} · ${fixed(board.size_mm[0], 1)} × ${fixed(board.size_mm[1], 1)} mm · hover a pad or a bus`
          : null}
      </p>
      <div className="flex flex-wrap gap-1 border-b border-line px-5 pt-2 pb-2.5">
        {board.buses.map((bus) => {
          const active = lit.buses.has(bus.id);

          return (
            <button
              key={bus.id}
              type="button"
              onPointerEnter={() => setHover({ kind: "bus", id: bus.id })}
              onPointerLeave={() => setHover(undefined)}
              onFocus={() => setHover({ kind: "bus", id: bus.id })}
              onBlur={() => setHover(undefined)}
              className={cn(
                "cursor-pointer rounded-full border px-[7px] py-[3px] font-label text-[9px] leading-3 whitespace-pre",
                active ? "border-blue bg-blue text-white" : "border-line-strong text-ink",
              )}
            >
              {bus.peripheral.toUpperCase()} {busDetail(bus).split(" · ")[1]}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col border-b border-line">
        {board.devices.map((device) => (
          <SensorRow
            key={device.id}
            device={device}
            bus={device.bus.toUpperCase()}
            healthy={streaming ? (device.type === "imu" ? imuHealthy : true) : undefined}
            reading={
              device.type === "imu"
                ? `az ${fixed(reading("imu_az"), 2)} m/s²`
                : `${fixed(reading("baro_pa") / 100, 2)} hPa`
            }
          />
        ))}
      </div>
    </div>
  );
};
