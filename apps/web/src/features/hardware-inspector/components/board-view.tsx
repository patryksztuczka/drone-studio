import type { BoardLayout, LayoutDevice, LayoutPad } from "@drone-studio/engine-client";
import { cn } from "@drone-studio/ui/lib/utils";
import { useAtomValue } from "@effect/atom-react";
import { Option } from "effect";
import { useState } from "react";

import { fixed } from "../../../shared/format.ts";
import { activeFlight, playhead } from "../../../shared/studio.atoms.ts";
import { frequencyLabel, highlightFor, padEdge, padFunction, toBoard } from "../board-geometry.ts";
import type { Selection } from "../board-geometry.ts";

const PAD_COLORS: ReadonlyMap<string, string> = new Map([
  ["motor", "#22d3ee"],
  ["power", "#f05252"],
  ["uart", "#f5a524"],
  ["usb", "#a78bfa"],
]);

const DEVICE_COLORS: ReadonlyMap<string, string> = new Map([
  ["imu", "#f472b6"],
  ["barometer", "#a3e635"],
]);

const BUS_COLORS: ReadonlyMap<string, string> = new Map([
  ["spi", "#f472b6"],
  ["i2c", "#a3e635"],
  ["uart", "#f5a524"],
]);

const GYRO_CALIBRATED = 1 << 0;

const IMU_FAULT = 1 << 7;

interface PadMarkProps {
  readonly pad: LayoutPad;
  readonly lit: boolean;
  readonly dim: boolean;
  readonly onHover: (selection: Selection | undefined) => void;
}

const LABEL_GAP = 0.6;

const labelPlacement = (pad: LayoutPad, width: number, height: number) => {
  const point = toBoard(pad.x_mm, pad.y_mm);
  const edge = padEdge(pad.x_mm, pad.y_mm);

  if (pad.kind === "motor" || edge === "right") {
    const right = point.x > 0;

    return {
      x: point.x + (right ? width / 2 + LABEL_GAP : -width / 2 - LABEL_GAP),
      y: point.y + 0.42,
      anchor: right ? "start" : "end",
      rotate: 0,
    } as const;
  }

  if (edge === "left") {
    return {
      x: point.x - width / 2 - LABEL_GAP,
      y: point.y + 0.42,
      anchor: "end",
      rotate: 0,
    } as const;
  }

  const above = edge === "front";

  return {
    x: point.x + 0.4,
    y: point.y + (above ? -height / 2 - LABEL_GAP : height / 2 + LABEL_GAP),
    anchor: above ? "start" : "end",
    rotate: -90,
  } as const;
};

const PadMark = ({ pad, lit, dim, onHover }: PadMarkProps) => {
  const point = toBoard(pad.x_mm, pad.y_mm);
  const color = PAD_COLORS.get(pad.kind) ?? "#94a3b8";

  const sideways =
    padEdge(pad.x_mm, pad.y_mm) === "front" || padEdge(pad.x_mm, pad.y_mm) === "rear";

  const wide = pad.kind === "motor" || pad.kind === "power" || pad.kind === "usb";
  const long = wide ? 2.4 : 1.6;
  const short = wide ? 1.7 : 1.1;
  const width = sideways && pad.kind !== "motor" ? short : long;
  const height = sideways && pad.kind !== "motor" ? long : short;
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
        rx={0.3}
        fill={lit ? color : "#c9a227"}
        stroke={lit ? "#ffffff" : "#8a6d14"}
        strokeWidth={0.12}
        style={lit ? { filter: `drop-shadow(0 0 0.6px ${color})` } : undefined}
      />
      <text
        x={label.x}
        y={label.y}
        textAnchor={label.anchor}
        transform={
          label.rotate === 0
            ? undefined
            : `rotate(${String(label.rotate)} ${String(label.x)} ${String(label.y)})`
        }
        fontSize={1.05}
        fill={lit ? color : "#7b8698"}
        fontFamily="Geist Mono Variable, monospace"
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
  readonly onHover: (selection: Selection | undefined) => void;
}

const DeviceMark = ({ device, lit, onHover }: DeviceMarkProps) => {
  const point = toBoard(device.position_mm[0], device.position_mm[1]);
  const width = device.size_mm[1];
  const height = device.size_mm[0];
  const color = DEVICE_COLORS.get(device.type) ?? "#94a3b8";

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
    >
      <rect
        x={point.x - width / 2}
        y={point.y - height / 2}
        width={width}
        height={height}
        rx={0.25}
        fill="#15181e"
        stroke={color}
        strokeWidth={lit ? 0.28 : 0.14}
        style={lit ? { filter: `drop-shadow(0 0 0.8px ${color})` } : undefined}
      />
      <circle
        cx={point.x - width / 2 + 0.45}
        cy={point.y - height / 2 + 0.45}
        r={0.18}
        fill={color}
      />
      <text
        x={point.x}
        y={point.y + height / 2 + 1.25}
        textAnchor="middle"
        fontSize={0.95}
        fill={color}
        fontFamily="Geist Mono Variable, monospace"
        pointerEvents="none"
      >
        {device.type === "imu" ? "IMU" : "BARO"}
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

const SensorRow = ({ device, bus, reading, healthy }: SensorRowProps) => {
  const color = DEVICE_COLORS.get(device.type) ?? "#94a3b8";

  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11.5px] text-foreground">{device.name}</p>
        <p className="font-mono text-[9.5px] text-faint">
          {bus}
          {device.chip_select === null ? "" : ` · CS ${device.chip_select}`}
          {device.address === null ? "" : ` · 0x${device.address.toString(16)}`} · WHO_AM_I 0x
          {device.identity.register.toString(16)} = 0x{device.identity.value.toString(16)}
        </p>
      </div>
      <div className="flex flex-col items-end">
        <span
          className={cn(
            "font-mono text-[9px] tracking-[0.12em]",
            healthy === undefined ? "text-faint" : healthy ? "text-real" : "text-danger",
          )}
        >
          {healthy === undefined ? "IDLE" : healthy ? "STREAMING" : "FAULT"}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{reading}</span>
      </div>
    </div>
  );
};

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
  const mcuSize = mcu.size_mm[0];
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

  const hoveredBus =
    hover?.kind === "bus" ? board.buses.find((bus) => bus.id === hover.id) : undefined;

  const hoveredDevice =
    hover?.kind === "device" ? board.devices.find((device) => device.id === hover.id) : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative rounded-lg border border-hairline bg-[radial-gradient(circle_at_50%_40%,#111a17,#0b0e14_75%)]">
        <svg
          viewBox={`${String(-half - 6)} ${String(-half - 7)} ${String(half * 2 + 12)} ${String(half * 2 + 13)}`}
          className="block aspect-square w-full"
          role="img"
          aria-label={board.name}
        >
          <defs>
            <pattern id="soldermask" width="1" height="1" patternUnits="userSpaceOnUse">
              <path d="M0 1L1 0" stroke="#0f2a20" strokeWidth="0.08" />
            </pattern>
          </defs>
          <rect
            x={-half}
            y={-half}
            width={half * 2}
            height={half * 2}
            rx={1.6}
            fill="#0b2018"
            stroke="#1d4636"
            strokeWidth={0.2}
          />
          <rect
            x={-half}
            y={-half}
            width={half * 2}
            height={half * 2}
            rx={1.6}
            fill="url(#soldermask)"
          />
          <path
            d={`M-2 ${String(-half - 5.4)}L0 ${String(-half - 6.6)}L2 ${String(-half - 5.4)}`}
            fill="none"
            stroke="#22d3ee"
            strokeWidth={0.25}
          />
          <text
            x={0}
            y={-half - 4.4}
            textAnchor="middle"
            pointerEvents="none"
            fontSize={0.9}
            fill="#22d3ee"
            fontFamily="Geist Mono Variable, monospace"
          >
            FRONT
          </text>
          {board.mounting_holes_mm.map(([x, y]) => {
            const point = toBoard(x, y);

            return (
              <g key={`${String(x)}-${String(y)}`}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={1.55}
                  fill="#c9a22733"
                  stroke="#c9a227"
                  strokeWidth={0.18}
                />
                <circle cx={point.x} cy={point.y} r={0.95} fill="#0b0e14" />
              </g>
            );
          })}
          {[...lit.devices].map((deviceId) => {
            const device = board.devices.find((candidate) => candidate.id === deviceId);

            if (device === undefined) return null;

            const point = toBoard(device.position_mm[0], device.position_mm[1]);
            const bus = board.buses.find((candidate) => candidate.id === device.bus);
            const color = BUS_COLORS.get(bus?.kind ?? "") ?? "#94a3b8";

            return (
              <path
                key={`trace-${deviceId}`}
                d={`M0 0L${String(point.x * 0.4)} ${String(point.y * 0.4)}L${String(point.x)} ${String(point.y)}`}
                fill="none"
                stroke={color}
                strokeWidth={0.22}
                strokeDasharray="0.6 0.35"
              >
                <animate
                  attributeName="stroke-dashoffset"
                  from="2"
                  to="0"
                  dur="0.8s"
                  repeatCount="indefinite"
                />
              </path>
            );
          })}
          {[...lit.pads].map((padId) => {
            const pad = board.pads.find((candidate) => candidate.id === padId);

            if (pad === undefined) return null;

            const point = toBoard(pad.x_mm, pad.y_mm);
            const edge = mcuSize / 2;

            const start = {
              x: Math.max(-edge, Math.min(edge, point.x)),
              y: Math.max(-edge, Math.min(edge, point.y)),
            };

            return (
              <path
                key={`trace-${padId}`}
                d={`M${String(start.x)} ${String(start.y)}L${String(point.x)} ${String(point.y)}`}
                fill="none"
                stroke={PAD_COLORS.get(pad.kind) ?? "#94a3b8"}
                strokeWidth={0.22}
                strokeDasharray="0.6 0.35"
              >
                <animate
                  attributeName="stroke-dashoffset"
                  from="2"
                  to="0"
                  dur="0.8s"
                  repeatCount="indefinite"
                />
              </path>
            );
          })}
          <g>
            <rect
              x={-mcuSize / 2}
              y={-mcuSize / 2}
              width={mcuSize}
              height={mcuSize}
              rx={0.5}
              fill="#16191f"
              stroke="#2c3441"
              strokeWidth={0.15}
            />
            {Array.from({ length: 25 }, (_, index) => {
              const offset = -mcuSize / 2 + 0.8 + (index * (mcuSize - 1.6)) / 24;

              return (
                <g key={index} stroke="#6b7280" strokeWidth={0.12}>
                  <line x1={offset} x2={offset} y1={-mcuSize / 2} y2={-mcuSize / 2 - 0.55} />
                  <line x1={offset} x2={offset} y1={mcuSize / 2} y2={mcuSize / 2 + 0.55} />
                  <line y1={offset} y2={offset} x1={-mcuSize / 2} x2={-mcuSize / 2 - 0.55} />
                  <line y1={offset} y2={offset} x1={mcuSize / 2} x2={mcuSize / 2 + 0.55} />
                </g>
              );
            })}
            <circle cx={-mcuSize / 2 + 1.2} cy={-mcuSize / 2 + 1.2} r={0.4} fill="#2c3441" />
            <text
              x={0}
              y={-4.4}
              pointerEvents="none"
              textAnchor="middle"
              fontSize={1.25}
              fill="#c9d1dc"
              fontFamily="Geist Mono Variable, monospace"
            >
              STM32H743
            </text>
            <text
              x={0}
              y={-3}
              pointerEvents="none"
              textAnchor="middle"
              fontSize={0.85}
              fill="#4a5466"
              fontFamily="Geist Mono Variable, monospace"
            >
              {mcu.core} · {String(mcu.clock_hz / 1_000_000)} MHz
            </text>
          </g>
          {board.devices.map((device) => (
            <DeviceMark
              key={device.id}
              device={device}
              lit={lit.devices.has(device.id)}
              onHover={setHover}
            />
          ))}
          {board.pads.map((pad) => (
            <PadMark
              key={pad.id}
              pad={pad}
              lit={lit.pads.has(pad.id)}
              dim={anything && !lit.pads.has(pad.id)}
              onHover={setHover}
            />
          ))}
        </svg>
        <div
          className="mx-2 mb-2 min-h-[30px] rounded-md border border-hairline bg-[#0b0e14e6] px-2.5 py-1.5"
          aria-live="polite"
        >
          {hoveredPad !== undefined ? (
            <p className="font-mono text-[10.5px]">
              <span style={{ color: PAD_COLORS.get(hoveredPad.kind) }}>{hoveredPad.label}</span>
              <span className="text-faint"> · net </span>
              <span className="text-foreground">{hoveredPad.net}</span>
              <span className="text-faint"> · </span>
              <span className="text-muted-foreground">{padFunction(board, hoveredPad)}</span>
            </p>
          ) : null}
          {hoveredBus !== undefined ? (
            <p className="font-mono text-[10.5px] text-muted-foreground">
              <span style={{ color: BUS_COLORS.get(hoveredBus.kind) }}>
                {hoveredBus.peripheral.toUpperCase()}
              </span>{" "}
              · {frequencyLabel(hoveredBus.frequency_hz)} ·{" "}
              {hoveredBus.pins.map((pin) => `${pin.role.toUpperCase()} ${pin.pin}`).join(" · ")}
            </p>
          ) : null}
          {hoveredDevice !== undefined ? (
            <p className="font-mono text-[10.5px] text-muted-foreground">
              <span style={{ color: DEVICE_COLORS.get(hoveredDevice.type) }}>
                {hoveredDevice.name}
              </span>{" "}
              · {hoveredDevice.bus}
              {hoveredDevice.interrupt === null ? "" : ` · INT ${hoveredDevice.interrupt}`}
            </p>
          ) : null}
          {anything ? null : (
            <p className="font-mono text-[10.5px] text-faint">
              {board.name} · {fixed(board.size_mm[0], 1)} × {fixed(board.size_mm[1], 1)} mm · hover
              a pad or a bus
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {board.buses.map((bus) => {
          const color = BUS_COLORS.get(bus.kind) ?? "#94a3b8";
          const active = lit.buses.has(bus.id);

          return (
            <button
              key={bus.id}
              type="button"
              onPointerEnter={() => setHover({ kind: "bus", id: bus.id })}
              onPointerLeave={() => setHover(undefined)}
              onFocus={() => setHover({ kind: "bus", id: bus.id })}
              onBlur={() => setHover(undefined)}
              className="flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] transition-colors"
              style={{
                borderColor: active ? `${color}99` : "#1f2632",
                color: active ? color : "#7b8698",
                background: active ? `${color}14` : undefined,
              }}
            >
              <span className="size-1.5 rounded-full" style={{ background: color }} />
              {bus.peripheral.toUpperCase()}
              <span className="text-faint">{frequencyLabel(bus.frequency_hz)}</span>
            </button>
          );
        })}
      </div>
      <div className="divide-y divide-hairline rounded-lg border border-hairline bg-[#0d1118] px-3">
        {board.devices.map((device) => (
          <SensorRow
            key={device.id}
            device={device}
            bus={`${device.bus.toUpperCase()}`}
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
