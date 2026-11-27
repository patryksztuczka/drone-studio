import { useAtomValue } from "@effect/atom-react";

import { manualFlightActive } from "../../../shared/studio.atoms.ts";
import { heldSticks, stickSource } from "../manual-flight.atoms.ts";

interface GimbalProps {
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly xLabel: string;
  readonly yLabel: string;
}

const Gimbal = ({ label, x, y, xLabel, yLabel }: GimbalProps) => (
  <figure className="flex flex-col items-center gap-1">
    <svg viewBox="-50 -50 100 100" className="size-[86px]" role="img" aria-label={label}>
      <rect x="-46" y="-46" width="92" height="92" fill="#ffffff" stroke="#d0d0d0" />
      <line x1="-46" x2="46" y1="0" y2="0" stroke="#e5e5e5" />
      <line x1="0" x2="0" y1="-46" y2="46" stroke="#e5e5e5" />
      <circle r="24" fill="none" stroke="#d0d0d0" strokeDasharray="2 3" />
      <line x1="0" y1="0" x2={x * 38} y2={-y * 38} stroke="#0a6cff99" strokeWidth="1.2" />
      <circle cx={x * 38} cy={-y * 38} r="5" fill="#ffffff" stroke="#0a6cff" strokeWidth="1.5" />
    </svg>
    <figcaption className="flex gap-2 font-label text-[11px] text-faint">
      <span>{xLabel}</span>
      <span>{yLabel}</span>
    </figcaption>
  </figure>
);

export const StickHud = () => {
  const active = useAtomValue(manualFlightActive);
  const sticks = useAtomValue(heldSticks);
  const source = useAtomValue(stickSource);

  if (!active) return null;

  return (
    <section
      aria-label="Sticks"
      className="pointer-events-none absolute bottom-[184px] left-1/2 flex -translate-x-1/2 items-end gap-3 border border-line-strong bg-surface px-3.5 pt-3 pb-3 shadow-card"
    >
      <Gimbal
        label="Left stick"
        x={sticks.yaw}
        y={sticks.throttle * 2 - 1}
        xLabel="YAW"
        yLabel="THR"
      />
      <Gimbal label="Right stick" x={sticks.roll} y={sticks.pitch} xLabel="ROLL" yLabel="PITCH" />
      <div className="flex w-[150px] flex-col gap-1.5 pb-1">
        <span
          className={
            sticks.arm
              ? "w-fit rounded-full border border-blue px-2 py-0.5 font-label text-[11px] text-blue"
              : "w-fit rounded-full border border-line-strong px-2 py-0.5 font-label text-[11px] text-muted"
          }
        >
          {sticks.arm ? "ARM SWITCH ON" : "ARM SWITCH OFF"}
        </span>
        <span className="font-label text-[11px] text-ink">
          {sticks.mode === "althold" ? "ALT HOLD" : "ANGLE"} · THR{" "}
          {Math.round(sticks.throttle * 100)}%
        </span>
        <span className="truncate font-label text-[11px] text-faint" title={source}>
          {source === "keyboard" ? "keyboard: W/S A/D arrows · Enter arm · M mode" : source}
        </span>
      </div>
    </section>
  );
};
