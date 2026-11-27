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
      <rect x="-46" y="-46" width="92" height="92" rx="14" fill="#0b0e14b3" stroke="#1f2632" />
      <line x1="-46" x2="46" y1="0" y2="0" stroke="#1f2632" />
      <line x1="0" x2="0" y1="-46" y2="46" stroke="#1f2632" />
      <circle r="24" fill="none" stroke="#1f2632" strokeDasharray="2 3" />
      <line x1="0" y1="0" x2={x * 38} y2={-y * 38} stroke="#22d3ee66" strokeWidth="1.5" />
      <circle
        cx={x * 38}
        cy={-y * 38}
        r="6.5"
        fill="#22d3ee"
        style={{ filter: "drop-shadow(0 0 6px #22d3ee)" }}
      />
    </svg>
    <figcaption className="flex gap-2 font-mono text-[9px] tracking-[0.1em] text-faint">
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
      className="pointer-events-none absolute bottom-3 left-3 flex items-end gap-3 rounded-lg border border-hairline bg-[#0b0e14b3] px-3 pt-2 pb-2.5 backdrop-blur-md"
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
          className="w-fit rounded-sm border px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em]"
          style={
            sticks.arm
              ? { color: "#22d3ee", borderColor: "#22d3ee66" }
              : { color: "#7b8698", borderColor: "#1f2632" }
          }
        >
          {sticks.arm ? "ARM SWITCH ON" : "ARM SWITCH OFF"}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {sticks.mode === "althold" ? "ALT HOLD" : "ANGLE"} · THR{" "}
          {Math.round(sticks.throttle * 100)}%
        </span>
        <span className="truncate font-mono text-[9px] text-faint" title={source}>
          {source === "keyboard" ? "keyboard: W/S A/D arrows · Enter arm · M mode" : source}
        </span>
      </div>
    </section>
  );
};
