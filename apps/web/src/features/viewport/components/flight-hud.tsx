import { cn } from "@drone-studio/ui/lib/utils";
import { useAtomValue } from "@effect/atom-react";
import { Option } from "effect";

import { fixed, signed } from "../../../shared/format.ts";
import { hudReadout, separation } from "../../../shared/hud-readout.ts";
import type { HudReadout } from "../../../shared/hud-readout.ts";
import { activeFlight, ghostFlight, playhead } from "../../../shared/studio.atoms.ts";

interface CellProps {
  readonly label: string;
  readonly value: string;
  readonly unit: string;
  readonly tone?: string | undefined;
}

const Cell = ({ label, value, unit, tone }: CellProps) => (
  <div className="flex w-1/3 flex-col">
    <span className="font-label text-[10px] leading-3 text-faint">{label}</span>
    <span className={cn("font-label text-[15px] leading-[18px] tabular-nums", tone ?? "text-ink")}>
      {value}
      {unit === "" ? null : <span className="text-[10px] leading-3 text-faint"> {unit}</span>}
    </span>
  </div>
);

interface HorizonProps {
  readonly roll: number;
  readonly pitch: number;
  readonly setpointRoll: number;
  readonly setpointPitch: number;
}

const Horizon = ({ roll, pitch, setpointRoll, setpointPitch }: HorizonProps) => {
  const shift = Math.max(-26, Math.min(26, pitch * 1.4));
  const targetShift = Math.max(-26, Math.min(26, setpointPitch * 1.4));

  return (
    <svg viewBox="0 0 72 72" className="size-[72px] shrink-0" role="img" aria-label="Attitude">
      <defs>
        <clipPath id="hud-horizon">
          <circle cx="36" cy="36" r="35" />
        </clipPath>
      </defs>
      <g clipPath="url(#hud-horizon)">
        <g transform={`rotate(${String(-roll)} 36 36) translate(0 ${String(shift)})`}>
          <rect x="-20" y="-40" width="112" height="78" fill="#eaf2ff" />
          <rect x="-20" y="38" width="112" height="80" fill="#f3eee6" />
          <path d="M-20 38H92" stroke="#0a6cff" />
          <path d="M26 30H46M29 22H43M26 46H46" stroke="#9a9a9a" strokeWidth="0.8" />
        </g>
        <g transform={`rotate(${String(-setpointRoll)} 36 36) translate(0 ${String(targetShift)})`}>
          <path d="M8 37H64" stroke="#0a6cff99" strokeDasharray="3 3" />
        </g>
      </g>
      <circle cx="36" cy="36" r="35" fill="none" stroke="#d0d0d0" />
      <path
        d="M22 37H31L36 41L41 37H50"
        fill="none"
        stroke="#e58a00"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

const HudPill = ({ tone, children }: { readonly tone: string; readonly children: string }) => (
  <span
    className={cn(
      "rounded-full border px-[7px] py-0.5 font-label text-[10px] leading-3 whitespace-nowrap",
      tone,
    )}
  >
    {children}
  </span>
);

const ARM_TONES: Readonly<Record<HudReadout["arm"], string>> = {
  ARMED: "border-blue text-blue",
  DISARMED: "border-line-strong text-muted",
  FAILSAFE: "border-fail text-fail",
};

const windArrow = (from: number) => {
  const towards = (from + 180) % 360;
  const arrows = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];

  return arrows[Math.round(towards / 45) % 8] ?? "→";
};

interface FlightHudProps {
  readonly className?: string;
}

export const FlightHud = ({ className }: FlightHudProps) => {
  const flight = useAtomValue(activeFlight);
  const ghost = useAtomValue(ghostFlight);
  const t = useAtomValue(playhead);

  if (Option.isNone(flight) || flight.value.table.length === 0) return null;

  const readout = hudReadout(flight.value.table, t);

  const gap = Option.map(ghost, (other) => separation(flight.value.table, other.table, t).distance);

  return (
    <section
      aria-label="Flight readout"
      className={cn(
        "pointer-events-none flex w-[380px] flex-col border border-line-strong bg-surface shadow-card",
        className,
      )}
    >
      <div className="flex gap-4 px-3.5 pt-3.5 pb-3">
        <Horizon
          roll={readout.roll}
          pitch={readout.pitch}
          setpointRoll={readout.setpointRoll}
          setpointPitch={readout.setpointPitch}
        />
        <div className="flex flex-1 flex-wrap gap-y-2">
          <Cell label="ALT" value={fixed(readout.height, 2)} unit="m" />
          <Cell label="V/S" value={signed(readout.climb, 2)} unit="m/s" />
          <Cell label="GND SPD" value={fixed(readout.groundSpeed, 2)} unit="m/s" />
          <Cell label="ROLL" value={signed(readout.roll, 1)} unit="°" />
          <Cell label="PITCH" value={signed(readout.pitch, 1)} unit="°" />
          <Cell label="YAW" value={fixed(((readout.yaw % 360) + 360) % 360, 0)} unit="°" />
          <Cell label="PACK" value={fixed(readout.voltage, 2)} unit="V" />
          <Cell label="CURRENT" value={fixed(readout.current, 1)} unit="A" />
          <Cell
            label="CHARGE"
            value={fixed(readout.charge * 100, 0)}
            unit="%"
            tone={readout.charge < 0.2 ? "text-fail" : undefined}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-3.5 py-[9px]">
        <HudPill tone={ARM_TONES[readout.arm]}>{readout.arm}</HudPill>
        <HudPill tone="border-line-strong text-ink">
          {readout.altitudeHold ? "ALT HOLD" : "ANGLE"}
        </HudPill>
        {readout.saturated ? <HudPill tone="border-amber text-amber">SATURATED</HudPill> : null}
        {readout.wind > 0.3 ? (
          <HudPill tone="border-line-strong text-ink">
            {`WIND ${fixed(readout.wind, 1)} m/s ${windArrow(readout.windFrom)}`}
          </HudPill>
        ) : null}
        {Option.isSome(gap) ? (
          <HudPill tone="border-ghost text-ghost">
            {`GHOST · base · Δ ${fixed(gap.value, 2)} m`}
          </HudPill>
        ) : null}
      </div>
    </section>
  );
};
