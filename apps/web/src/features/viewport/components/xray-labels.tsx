import type { BoardLayout } from "@drone-studio/engine-client";
import type { Object3D } from "three";

import { frdToScene } from "../frames-of-reference.ts";
import type { Anchor, TagSlots } from "./anchor-tags.tsx";

const SHORT: ReadonlyMap<string, string> = new Map([
  ["board", "FC"],
  ["imu", "IMU"],
  ["barometer", "BARO"],
  ["battery", "BATT"],
]);

const FAN: ReadonlyMap<string, readonly [number, number]> = new Map([
  ["board", [-150, -110]],
  ["imu", [150, -130]],
  ["barometer", [170, -40]],
  ["battery", [-170, -20]],
]);

export const xrayAnchors = (
  layout: BoardLayout,
  body: () => Object3D | null,
): ReadonlyArray<Anchor> =>
  layout.airframe.hotspots.map((hotspot) => ({
    id: `xray:${hotspot.id}`,
    object: body,
    local: frdToScene(hotspot.position_m),
  }));

interface XrayLabelLayerProps {
  readonly layout: BoardLayout;
  readonly slots: TagSlots;
}

export const XrayLabelLayer = ({ layout, slots }: XrayLabelLayerProps) => (
  <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
    {layout.airframe.hotspots.map((hotspot) => {
      const motor = hotspot.kind === "motor";
      const [dx, dy] = FAN.get(hotspot.kind) ?? [16, 22];
      const length = Math.hypot(dx, dy);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      const id = `xray:${hotspot.id}`;

      return (
        <div
          key={hotspot.id}
          ref={(element) => {
            if (element === null) slots.delete(id);
            else slots.set(id, { root: element });
          }}
          className="absolute top-0 left-0 opacity-0 transition-opacity duration-150"
        >
          <span className="absolute -top-[3.5px] -left-[3.5px] size-[7px] rounded-full border border-blue bg-surface" />
          {motor ? null : (
            <span
              className="absolute top-0 left-0 h-0 origin-left border-t border-dashed border-blue/60"
              style={{ width: length, transform: `rotate(${String(angle)}deg)` }}
            />
          )}
          <span
            className="absolute flex items-center gap-2 border border-line-strong bg-surface px-2.5 py-[5px] font-label text-[12px] leading-4 whitespace-nowrap"
            style={{
              left: dx,
              top: dy,
              transform: `translate(${dx < 0 ? "-100%" : "0"}, -50%)`,
            }}
          >
            {motor ? (
              <span className="text-muted">{hotspot.label.replace("Motor ", "")}</span>
            ) : (
              <>
                <span className="text-muted">{SHORT.get(hotspot.kind) ?? hotspot.kind}</span>
                <span className="text-ink">{hotspot.label}</span>
              </>
            )}
          </span>
        </div>
      );
    })}
  </div>
);
