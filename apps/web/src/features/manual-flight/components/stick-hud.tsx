import { cn } from "@drone-studio/ui/lib/utils";
import { useAtomValue } from "@effect/atom-react";

import { manualFlightActive } from "../../../shared/studio.atoms.ts";
import { heldSticks, stickSource } from "../manual-flight.atoms.ts";

interface GimbalProps {
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly caption: string;
}

const Gimbal = ({ label, x, y, caption }: GimbalProps) => (
  <figure className="flex flex-col items-center gap-1.5">
    <svg viewBox="0 0 86 86" className="size-[86px]" role="img" aria-label={label}>
      <rect x="0.5" y="0.5" width="85" height="85" rx="8" fill="#ffffff" stroke="#d0d0d0" />
      <path d="M43 8V78M8 43H78" stroke="#e5e5e5" />
      <circle cx="43" cy="43" r="20" fill="none" stroke="#efefef" />
      <circle cx={43 + x * 30} cy={43 - y * 30} r="12" fill="#0a6cff1f" />
      <circle cx={43 + x * 30} cy={43 - y * 30} r="7" fill="#0a6cff" />
    </svg>
    <figcaption className="font-label text-[10px] leading-3 text-faint">{caption}</figcaption>
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
      className="pointer-events-none absolute bottom-[30px] left-5 z-10 flex w-[440px] items-center gap-4 border border-line-strong bg-surface p-3.5 shadow-card"
    >
      <Gimbal label="Left stick" x={sticks.yaw} y={sticks.throttle * 2 - 1} caption="YAW · THR" />
      <Gimbal label="Right stick" x={sticks.roll} y={sticks.pitch} caption="ROLL · PITCH" />
      <div className="flex min-w-0 flex-1 flex-col gap-2 font-label">
        <span
          className={cn(
            "self-start border px-[9px] py-[3px] text-[11px] leading-[14px]",
            sticks.arm ? "border-blue bg-blue-soft text-blue" : "border-line-strong text-muted",
          )}
        >
          {sticks.arm ? "ARM SWITCH ON" : "ARM SWITCH OFF"}
        </span>
        <span className="text-[11px] leading-[14px] text-ink">
          {sticks.mode === "althold" ? "ALT HOLD" : "ANGLE"} · THR{" "}
          {Math.round(sticks.throttle * 100)}%
        </span>
        <span className="text-[10px] leading-[15px] text-faint">
          {source === "keyboard" ? "keyboard" : source}
          <br />
          A arm · Y mode · or keys W/S A/D ←→↑↓ · ⏎ arm · M mode
        </span>
      </div>
    </section>
  );
};
