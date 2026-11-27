import type { BoardLayout } from "@drone-studio/engine-client";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo } from "react";
import { Vector3 } from "three";
import type { Group } from "three";

import { frdToScene } from "../frames-of-reference.ts";

export type LabelSlots = Map<string, HTMLDivElement>;

interface XrayLabelsProps {
  readonly layout: BoardLayout;
  readonly slots: LabelSlots;
  readonly body: () => Group | null;
}

export const XrayLabelTracker = ({ layout, slots, body }: XrayLabelsProps) => {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const point = useMemo(() => new Vector3(), []);

  useFrame(() => {
    const group = body();

    for (const hotspot of layout.airframe.hotspots) {
      const element = slots.get(hotspot.id);

      if (element === undefined) continue;

      if (group === null || !group.visible) {
        element.style.opacity = "0";
        continue;
      }

      point.set(...frdToScene(hotspot.position_m));
      group.localToWorld(point);
      point.project(camera);

      const x = ((point.x + 1) / 2) * size.width;
      const y = ((1 - point.y) / 2) * size.height;
      const inFront = point.z < 1;

      element.style.opacity = inFront ? "1" : "0";
      element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  });

  return null;
};

const TONES: ReadonlyMap<string, string> = new Map([
  ["board", "#22d3ee"],
  ["imu", "#f472b6"],
  ["barometer", "#a3e635"],
  ["battery", "#f5a524"],
  ["motor", "#94a3b8"],
]);

const SHORT: ReadonlyMap<string, string> = new Map([
  ["board", "FC"],
  ["imu", "IMU"],
  ["barometer", "BARO"],
  ["battery", "BATT"],
]);

const FAN: ReadonlyMap<string, readonly [number, number]> = new Map([
  ["board", [-120, -84]],
  ["imu", [118, -96]],
  ["barometer", [138, -34]],
  ["battery", [-138, -18]],
]);

interface XrayLabelLayerProps {
  readonly layout: BoardLayout;
  readonly slots: LabelSlots;
}

export const XrayLabelLayer = ({ layout, slots }: XrayLabelLayerProps) => (
  <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
    {layout.airframe.hotspots.map((hotspot) => {
      const motor = hotspot.kind === "motor";
      const tone = TONES.get(hotspot.kind) ?? "#94a3b8";
      const [dx, dy] = FAN.get(hotspot.kind) ?? [0, -22];
      const length = Math.hypot(dx, dy);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

      return (
        <div
          key={hotspot.id}
          ref={(element) => {
            if (element === null) slots.delete(hotspot.id);
            else slots.set(hotspot.id, element);
          }}
          className="absolute top-0 left-0 opacity-0 transition-opacity duration-150"
        >
          <span
            className="absolute -top-[3px] -left-[3px] size-[6px] rounded-full"
            style={{ background: tone, boxShadow: `0 0 10px ${tone}` }}
          />
          <span
            className="absolute top-0 left-0 h-px origin-left"
            style={{
              width: length,
              transform: `rotate(${String(angle)}deg)`,
              background: `${tone}99`,
            }}
          />
          <span
            className="absolute font-mono text-[10px] leading-none whitespace-nowrap"
            style={{
              left: dx,
              top: dy,
              color: tone,
              transform: `translate(${dx < 0 ? "-100%" : "0"}, -50%)`,
              padding: dx < 0 ? "0 6px 0 0" : "0 0 0 6px",
            }}
          >
            {motor ? (
              hotspot.label.replace("Motor ", "")
            ) : (
              <span
                className="flex flex-col gap-0.5 rounded-sm border bg-[#0b0e14cc] px-1.5 py-1"
                style={{ borderColor: `${tone}55` }}
              >
                <span className="font-semibold tracking-[0.12em]">
                  {SHORT.get(hotspot.kind) ?? hotspot.kind}
                </span>
                <span className="text-[9px] text-[#94a3b8]">{hotspot.label}</span>
              </span>
            )}
          </span>
        </div>
      );
    })}
  </div>
);
