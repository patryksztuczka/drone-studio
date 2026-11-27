import { Dot, PillButton } from "@drone-studio/ui/components/pill";
import {
  CardBody,
  CardFooter,
  CardHeader,
  CardRow,
  SchematicCard,
} from "@drone-studio/ui/components/schematic-card";
import { cn } from "@drone-studio/ui/lib/utils";
import { useAtom, useAtomValue } from "@effect/atom-react";
import { Option } from "effect";

import { fixed, signed, stamp } from "../../../shared/format.ts";
import { hudReadout, separation } from "../../../shared/hud-readout.ts";
import type { HudReadout } from "../../../shared/hud-readout.ts";
import {
  activeFlight,
  cameraMode,
  ghostFlight,
  ghostRun,
  manualFlightActive,
  playhead,
  viewMode,
} from "../../../shared/studio.atoms.ts";
import type { FlightView } from "../../../shared/studio.atoms.ts";
import { useTransport } from "../../../shared/transport.ts";
import { commandHistory, leadingMotors } from "../motor-history.ts";

const ARM_TONES: Readonly<Record<HudReadout["arm"], "blue" | "faint" | "fail">> = {
  ARMED: "blue",
  DISARMED: "faint",
  FAILSAFE: "fail",
};

const ARM_TEXT: Readonly<Record<HudReadout["arm"], string>> = {
  ARMED: "text-blue",
  DISARMED: "text-muted",
  FAILSAFE: "text-fail",
};

const readoutOf = (flight: Option.Option<FlightView>, t: number) =>
  Option.flatMap(flight, (view) =>
    view.table.length === 0 ? Option.none() : Option.some(hudReadout(view.table, t)),
  );

const FlightCard = () => {
  const flight = useAtomValue(activeFlight);
  const ghost = useAtomValue(ghostFlight);
  const t = useAtomValue(playhead);
  const readout = readoutOf(flight, t);

  const gap = Option.flatMap(flight, (view) =>
    Option.map(ghost, (other) => separation(view.table, other.table, t).distance),
  );

  return (
    <SchematicCard aria-label="Flight" className="w-[224px]">
      <CardHeader title="Flight" />
      {Option.match(readout, {
        onNone: () => (
          <CardBody>
            <CardRow label="state">
              <span className="inline-flex items-center gap-1.5 text-muted">
                <Dot tone="faint" />
                ON PAD
              </span>
            </CardRow>
            <p className="font-sans text-[13px] leading-[18px] text-muted">
              Press play to fly the scenario.
            </p>
          </CardBody>
        ),
        onSome: (value) => (
          <CardBody>
            <CardRow label="state">
              <span className={cn("inline-flex items-center gap-1.5", ARM_TEXT[value.arm])}>
                <Dot tone={ARM_TONES[value.arm]} />
                {value.arm}
              </span>
            </CardRow>
            <CardRow label="roll">{signed(value.roll, 2)}°</CardRow>
            <CardRow label="pitch">{signed(value.pitch, 2)}°</CardRow>
            <CardRow label="height">{fixed(value.height, 2)} m</CardRow>
            {value.wind > 0.3 ? <CardRow label="wind">{fixed(value.wind, 1)} m/s</CardRow> : null}
            {Option.isSome(gap) ? <CardRow label="ghost Δ">{fixed(gap.value, 2)} m</CardRow> : null}
          </CardBody>
        ),
      })}
      <CardFooter>
        <span className="text-muted">
          virtual
          <br />
          time
        </span>
        <span className="text-[13px] tabular-nums">{stamp(t)}</span>
      </CardFooter>
    </SchematicCard>
  );
};

const BAR_COUNT = 18;

const MotorsCard = () => {
  const flight = useAtomValue(activeFlight);
  const t = useAtomValue(playhead);

  const thrust = Option.match(flight, {
    onNone: () => [0, 0, 0, 0],
    onSome: (view) =>
      [1, 2, 3, 4].map((index) => {
        const value = view.table.sample(`thrust_${String(index)}`, t);

        return Number.isFinite(value) ? value : 0;
      }),
  });

  const saturated = Option.match(flight, {
    onNone: () => [false, false, false, false],
    onSome: (view) =>
      [1, 2, 3, 4].map((index) => view.table.sample(`motor_${String(index)}`, t) > 0.92),
  });

  const leading = leadingMotors(thrust);

  const bars = Option.match(flight, {
    onNone: () => Array.from({ length: BAR_COUNT }, () => 0),
    onSome: (view) => commandHistory(view.table, t, BAR_COUNT, 0.1),
  });

  return (
    <SchematicCard aria-label="Motors" className="w-[224px]">
      <CardHeader title="Motors" aside="thrust" />
      <CardBody>
        {thrust.map((value, index) => (
          <CardRow key={String(index)} label={`M${String(index + 1)}`}>
            <span
              className={cn(
                saturated[index] === true
                  ? "text-fail"
                  : leading[index] === true
                    ? "text-blue"
                    : "text-ink",
              )}
            >
              {fixed(value, 2)} N
            </span>
          </CardRow>
        ))}
      </CardBody>
      <div className="border-t border-line px-3.5 pt-2.5 pb-3">
        <svg
          width="186"
          height="18"
          viewBox="0 0 186 18"
          role="img"
          aria-label="Mean motor command, last 1.8 s"
        >
          {bars.map((value, index) => {
            const height = Math.max(value * 18, value > 0 ? 1 : 0);

            return (
              <rect
                key={String(index)}
                x={index * 10.3}
                y={18 - height}
                width={8}
                height={height}
                fill={value > 0.92 ? "#e5484d" : "#0a6cff"}
              />
            );
          })}
          <path d="M0 17.5H186" stroke="#0a6cff" />
        </svg>
      </div>
    </SchematicCard>
  );
};

const ViewPills = () => {
  const [mode, setMode] = useAtom(viewMode);
  const [camera, setCamera] = useAtom(cameraMode);
  const [ghost, setGhost] = useAtom(ghostRun);
  const manual = useAtomValue(manualFlightActive);
  const transport = useTransport();

  return (
    <div
      className="absolute bottom-[184px] left-24 flex items-center gap-2"
      role="group"
      aria-label="View"
    >
      <PillButton
        tone={mode === "xray" ? "blue" : "quiet"}
        aria-pressed={mode === "xray"}
        onClick={() => setMode(mode === "xray" ? "studio" : "xray")}
        title="Translucent frame, thrust, centre of mass and attitude setpoint (X)"
      >
        X-RAY
      </PillButton>
      <PillButton
        tone="quiet"
        onClick={() => setCamera(camera === "follow" ? "orbit" : "follow")}
        title="Follow the drone or orbit a fixed point (C)"
      >
        {camera === "follow" ? "FOLLOW" : "ORBIT"}
      </PillButton>
      <PillButton
        tone={manual ? "blue" : "quiet"}
        aria-pressed={manual}
        onClick={transport.startManual}
        title="Fly it yourself with a gamepad or the keyboard"
      >
        MANUAL FLIGHT
      </PillButton>
      {Option.isSome(ghost) ? (
        <PillButton
          tone="quiet"
          onClick={() => setGhost(Option.none())}
          title="Remove the ghost run"
        >
          GHOST ✕
        </PillButton>
      ) : null}
    </div>
  );
};

export const WorkbenchModule = () => (
  <>
    <div className="absolute top-[104px] left-24">
      <FlightCard />
    </div>
    <div className="absolute top-[104px] right-24">
      <MotorsCard />
    </div>
    <ViewPills />
  </>
);
