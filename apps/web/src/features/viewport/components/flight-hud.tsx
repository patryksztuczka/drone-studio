import { useAtomValue } from "@effect/atom-react";
import { Option } from "effect";

import { fixed, percent, signed } from "../../../shared/format.ts";
import { activeFlight, ghostFlight, playhead } from "../../../shared/studio.atoms.ts";
import { hudReadout, separation } from "../hud-readout.ts";
import type { HudReadout } from "../hud-readout.ts";

const ARM_TONE: Readonly<Record<HudReadout["arm"], string>> = {
  ARMED: "#22d3ee",
  DISARMED: "#7b8698",
  FAILSAFE: "#f05252",
};

interface CellProps {
  readonly label: string;
  readonly value: string;
  readonly unit: string;
  readonly tone?: string | undefined;
}

const Cell = ({ label, value, unit, tone }: CellProps) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[9px] font-medium tracking-[0.14em] text-faint">{label}</span>
    <span className="font-mono text-[15px] leading-none tabular-nums" style={{ color: tone }}>
      {value}
      <span className="ml-1 text-[10px] text-muted-foreground">{unit}</span>
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
  const shift = Math.max(-28, Math.min(28, pitch * 1.4));
  const targetShift = Math.max(-28, Math.min(28, setpointPitch * 1.4));

  return (
    <svg viewBox="-36 -36 72 72" className="size-[72px] shrink-0" role="img" aria-label="Attitude">
      <defs>
        <clipPath id="hud-horizon">
          <circle r="34" />
        </clipPath>
      </defs>
      <g clipPath="url(#hud-horizon)">
        <g transform={`rotate(${String(-roll)}) translate(0 ${String(shift)})`}>
          <rect x="-80" y="-80" width="160" height="80" fill="#0e2a36" />
          <rect x="-80" y="0" width="160" height="80" fill="#1a1712" />
          <line x1="-80" x2="80" y1="0" y2="0" stroke="#22d3ee" strokeWidth="1" />
          {[-20, -10, 10, 20].map((step) => (
            <line
              key={step}
              x1={-6}
              x2={6}
              y1={step * 1.4}
              y2={step * 1.4}
              stroke="#d7dde6"
              strokeOpacity="0.45"
              strokeWidth="0.8"
            />
          ))}
        </g>
        <g transform={`rotate(${String(-setpointRoll)}) translate(0 ${String(targetShift)})`}>
          <line
            x1="-22"
            x2="22"
            y1="0"
            y2="0"
            stroke="#e2e8f0"
            strokeOpacity="0.6"
            strokeDasharray="2 2"
            strokeWidth="1"
          />
        </g>
      </g>
      <circle r="34" fill="none" stroke="#1f2632" strokeWidth="2" />
      <path d="M-16 0h10l3 4 3-4h10" fill="none" stroke="#f5a524" strokeWidth="1.6" />
    </svg>
  );
};

export const FlightHud = () => {
  const flight = useAtomValue(activeFlight);
  const ghost = useAtomValue(ghostFlight);
  const t = useAtomValue(playhead);

  if (Option.isNone(flight) || flight.value.table.length === 0) return null;

  const readout = hudReadout(flight.value.table, t);
  const chargeTone = readout.charge < 0.2 ? "#f05252" : undefined;

  return (
    <div className="pointer-events-none absolute top-3 left-3 flex flex-col gap-2">
      <div className="flex items-center gap-3 rounded-lg border border-hairline bg-[#0b0e14cc] px-3 py-2.5 backdrop-blur-md">
        <Horizon
          roll={readout.roll}
          pitch={readout.pitch}
          setpointRoll={readout.setpointRoll}
          setpointPitch={readout.setpointPitch}
        />
        <div className="grid grid-cols-3 gap-x-5 gap-y-2.5">
          <Cell label="ALT" value={fixed(readout.height, 2)} unit="m" />
          <Cell label="V/S" value={signed(readout.climb, 2)} unit="m/s" />
          <Cell label="GND SPD" value={fixed(readout.groundSpeed, 2)} unit="m/s" />
          <Cell label="ROLL" value={signed(readout.roll, 1)} unit="°" />
          <Cell label="PITCH" value={signed(readout.pitch, 1)} unit="°" />
          <Cell label="YAW" value={fixed(((readout.yaw % 360) + 360) % 360, 0)} unit="°" />
          <Cell label="PACK" value={fixed(readout.voltage, 2)} unit="V" />
          <Cell label="CURRENT" value={fixed(readout.current, 1)} unit="A" />
          <Cell label="CHARGE" value={percent(readout.charge)} unit="" tone={chargeTone} />
        </div>
      </div>
      <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.12em]">
        <span
          className="rounded-sm border px-1.5 py-0.5"
          style={{ color: ARM_TONE[readout.arm], borderColor: `${ARM_TONE[readout.arm]}55` }}
        >
          {readout.arm}
        </span>
        <span className="rounded-sm border border-hairline px-1.5 py-0.5 text-muted-foreground">
          {readout.altitudeHold ? "ALT HOLD" : "ANGLE"}
        </span>
        {readout.saturated ? (
          <span className="rounded-sm border border-[#f5a52455] px-1.5 py-0.5 text-emu">
            SATURATED
          </span>
        ) : null}
        {readout.wind > 0.3 ? (
          <span className="flex items-center gap-1 rounded-sm border border-hairline px-1.5 py-0.5 text-[#7dd3fc]">
            <svg viewBox="-6 -6 12 12" className="size-2.5" aria-hidden="true">
              <path
                d="M0 -5L3 4L0 2L-3 4z"
                fill="currentColor"
                transform={`rotate(${String(readout.windFrom + 180)})`}
              />
            </svg>
            WIND {fixed(readout.wind, 1)} m/s
          </span>
        ) : null}
        {Option.isSome(ghost) ? (
          <span className="rounded-sm border border-[#a78bfa55] px-1.5 py-0.5 text-ghost">
            GHOST · {ghost.value.label} · Δ{" "}
            {fixed(separation(flight.value.table, ghost.value.table, t).distance, 2)} m · Δroll{" "}
            {signed(separation(flight.value.table, ghost.value.table, t).roll, 1)}°
          </span>
        ) : null}
      </div>
    </div>
  );
};
