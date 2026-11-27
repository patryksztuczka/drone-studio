import type { BoardLayout } from "@drone-studio/engine-client";
import type { Object3D } from "three";

import { frdToScene } from "../frames-of-reference.ts";
import type { PoseSampler } from "../pose-sampler.ts";
import { thrustBand } from "../thrust-band.ts";
import type { Anchor, TagSlots } from "./anchor-tags.tsx";

interface Callout {
  readonly short: string;
  readonly color: string;
  readonly dx: number;
  readonly dy: number;
}

const CALLOUTS: ReadonlyMap<string, Callout> = new Map([
  ["board", { short: "FC", color: "#0a6cff", dx: 270, dy: -24 }],
  ["imu", { short: "IMU", color: "#d6409f", dx: 270, dy: 4 }],
  ["battery", { short: "BATT", color: "#e58a00", dx: -248, dy: -10 }],
  ["barometer", { short: "BARO", color: "#5e9e00", dx: -266, dy: 18 }],
]);

const MOTOR_TAG =
  "absolute top-[18px] left-3 border bg-surface px-[5px] py-px font-label text-[10px] leading-3 whitespace-nowrap";

const BAND_CLASSES = {
  low: `${MOTOR_TAG} border-line text-muted`,
  mid: `${MOTOR_TAG} border-amber text-amber`,
  high: `${MOTOR_TAG} border-fail text-fail`,
} as const;

const motorName = (label: string) => label.replace("Motor ", "");

const motorIndex = (id: string) => Number(id.replace(/\D/g, "")) - 1;

export const xrayAnchors = (
  layout: BoardLayout,
  body: () => Object3D | null,
  sampler: PoseSampler,
): ReadonlyArray<Anchor> =>
  layout.airframe.hotspots.map((hotspot): Anchor => {
    const anchor = {
      id: `xray:${hotspot.id}`,
      object: body,
      local: frdToScene(hotspot.position_m),
    };

    if (hotspot.kind !== "motor") return anchor;

    const index = motorIndex(hotspot.id);
    const command = () => sampler.read(Number.NaN)?.motor[index] ?? 0;

    return {
      ...anchor,
      value: () =>
        thrustBand(command()) === "low"
          ? motorName(hotspot.label)
          : `${motorName(hotspot.label)} · ${String(Math.round(command() * 100))}%`,
      valueClass: () => BAND_CLASSES[thrustBand(command())],
    };
  });

interface XrayLabelLayerProps {
  readonly layout: BoardLayout;
  readonly slots: TagSlots;
}

export const XrayLabelLayer = ({ layout, slots }: XrayLabelLayerProps) => (
  <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
    {layout.airframe.hotspots.map((hotspot) => {
      const id = `xray:${hotspot.id}`;
      const callout = CALLOUTS.get(hotspot.kind);

      if (callout === undefined) {
        return (
          <div
            key={hotspot.id}
            ref={(element) => {
              if (element === null) slots.delete(id);
              else slots.set(id, { root: element, value: element.firstElementChild });
            }}
            className="absolute top-0 left-0 opacity-0"
          >
            <span className={BAND_CLASSES.low}>{motorName(hotspot.label)}</span>
          </div>
        );
      }

      const { dx, dy } = callout;

      return (
        <div
          key={hotspot.id}
          ref={(element) => {
            if (element === null) slots.delete(id);
            else slots.set(id, { root: element });
          }}
          className="absolute top-0 left-0 opacity-0 transition-opacity duration-150"
        >
          <svg className="absolute top-0 left-0 overflow-visible" width="1" height="1">
            <path
              d={`M0 0L${String(dx * 0.35)} ${String(dy)}H${String(dx)}`}
              fill="none"
              stroke="#11111166"
              strokeWidth="0.9"
            />
            <circle r="2.5" fill="#ffffff" stroke="#111111" />
          </svg>
          <span
            className="absolute flex items-center gap-2 border border-line-strong bg-surface px-[9px] py-1 whitespace-nowrap"
            style={{
              left: dx,
              top: dy,
              transform: `translate(${dx < 0 ? "-100%" : "0"}, -50%)`,
            }}
          >
            <span
              className="font-label text-[11px] leading-[14px]"
              style={{ color: callout.color }}
            >
              {callout.short}
            </span>
            <span className="text-[12px] leading-4 text-ink">{hotspot.label}</span>
          </span>
        </div>
      );
    })}
  </div>
);
