import { PillButton } from "@drone-studio/ui/components/pill";
import { cn } from "@drone-studio/ui/lib/utils";
import { RegistryContext, useAtom, useAtomValue } from "@effect/atom-react";
import { Option } from "effect";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

import { eventLabel, eventPillTone } from "../../../shared/event-style.ts";
import { clock, fixed } from "../../../shared/format.ts";
import {
  activeFlight,
  activeRunLoading,
  followLive,
  ghostFlight,
  playhead,
  telemetryOpen,
} from "../../../shared/studio.atoms.ts";
import type { FlightView } from "../../../shared/studio.atoms.ts";
import { SPEEDS, useTransport } from "../../../shared/transport.ts";
import type { Transport } from "../../../shared/transport.ts";
import {
  anomalyBands,
  fractionOf,
  labelledMarkers,
  liveSpanEnd,
  rulerTicks,
  seekStep,
  timeAt,
  timelineMarkers,
} from "../timeline-math.ts";
import type { Span } from "../timeline-math.ts";
import { plotY, seriesPath, valueRange } from "../timeline-plot.ts";
import { seekTo } from "./use-playback.ts";

const PLOTTED = "height";

const HEIGHT = 114;

const AXIS_Y = 92;

const BOX = { top: 26, bottom: 88 } as const;

const BAND_FILLS: ReadonlyMap<string, string> = new Map([
  ["GUST_START", "#0a6cff0d"],
  ["SATURATION", "#e5484d0a"],
  ["FAULT", "#e5484d0a"],
]);

export const spanOf = (flight: FlightView): Span => ({
  start: Math.min(flight.table.startTime, 0),
  end: flight.live
    ? liveSpanEnd(flight.table.endTime, flight.status?.duration_s ?? flight.table.endTime)
    : Math.max(flight.table.endTime, 0.1),
});

const useTrackWidth = () => {
  const element = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const target = element.current;

    if (target === null) return;

    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0]?.contentRect.width ?? 0);
    });

    observer.observe(target);

    return () => observer.disconnect();
  }, []);

  return { element, width };
};

interface TrackProps {
  readonly flight: FlightView;
  readonly ghost: Option.Option<FlightView>;
  readonly t: number;
}

const Track = ({ flight, ghost, t }: TrackProps) => {
  const registry = useContext(RegistryContext);
  const { element, width } = useTrackWidth();
  const span = spanOf(flight);
  const box = { ...BOX, width };

  const markers = useMemo(
    () => timelineMarkers(flight.events, flight.table.endTime),
    [flight.events, flight.table.endTime],
  );

  const tables = Option.match(ghost, {
    onNone: () => [flight.table],
    onSome: (other) => [flight.table, other.table],
  });

  const anomalies = useMemo(() => anomalyBands(flight.anomalies), [flight.anomalies]);
  const range = valueRange(tables, PLOTTED, span.end);
  const ticks = rulerTicks(span, width, 80);
  const head = fractionOf(t, span) * width;
  const headValue = flight.table.sample(PLOTTED, t);
  const headY = Number.isFinite(headValue) ? plotY(headValue, range, box) : AXIS_Y;
  const candidatePath = seriesPath(flight.table, PLOTTED, span, range, box);

  const baselinePath = Option.match(ghost, {
    onNone: () => "",
    onSome: (other) => seriesPath(other.table, PLOTTED, span, range, box),
  });

  const baselineEnd = Option.flatMap(ghost, (other) => {
    const value = other.table.sample(PLOTTED, span.end);

    return Number.isFinite(value) ? Option.some(plotY(value, range, box)) : Option.none();
  });

  const named = labelledMarkers(
    markers.points.map((event) => event.t),
    span,
    width,
    84,
  );

  const labelled = new Set([
    ticks[0],
    ticks[Math.round((ticks.length - 1) / 2)],
    ticks[ticks.length - 1],
  ]);

  const seekFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientX - bounds.left) / Math.max(bounds.width, 1);

    seekTo(registry, Math.min(timeAt(fraction, span), flight.table.endTime));
  };

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

    event.preventDefault();
    event.stopPropagation();
    seekTo(
      registry,
      seekStep(t, event.key === "ArrowLeft" ? -1 : 1, event.shiftKey, {
        start: span.start,
        end: flight.table.endTime,
      }),
    );
  };

  return (
    <div
      ref={element}
      role="slider"
      tabIndex={0}
      aria-label="Flight time"
      aria-valuemin={span.start}
      aria-valuemax={span.end}
      aria-valuenow={Number(t.toFixed(2))}
      aria-valuetext={clock(t)}
      className="relative min-w-0 flex-1 cursor-ew-resize touch-none outline-none select-none focus-visible:ring-2 focus-visible:ring-blue/30"
      style={{ height: HEIGHT }}
      onKeyDown={onKey}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        seekFromPointer(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) seekFromPointer(event);
      }}
    >
      <svg
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${String(Math.max(width, 1))} ${String(HEIGHT)}`}
        className="absolute inset-0 overflow-visible"
        aria-hidden="true"
      >
        <path d={`M0 ${String(AXIS_Y)}H${String(width)}`} stroke="#d0d0d0" />
        {ticks.map((tick) => {
          const x = fractionOf(tick, span) * width;

          return (
            <path
              key={tick}
              d={`M${x.toFixed(1)} ${String(AXIS_Y)}V${String(AXIS_Y + (labelled.has(tick) ? 6 : 4))}`}
              stroke="#d0d0d0"
            />
          );
        })}
        {markers.bands.map((band) => {
          const x = fractionOf(band.start, span) * width;
          const right = fractionOf(band.end, span) * width;

          return (
            <rect
              key={`${band.kind}-${String(band.start)}`}
              x={x}
              y={20}
              width={Math.max(right - x, 1)}
              height={AXIS_Y - 20}
              fill={BAND_FILLS.get(band.kind) ?? "#1111110a"}
            />
          );
        })}
        {anomalies.map((band) => {
          const x = fractionOf(band.start, span) * width;
          const right = fractionOf(band.end, span) * width;

          return (
            <rect
              key={`anomaly-${band.kind}-${String(band.start)}`}
              x={x}
              y={AXIS_Y - 3}
              width={Math.max(right - x, 2)}
              height={3}
              fill="#e58a00"
            >
              <title>{`anomaly: ${band.kind}`}</title>
            </rect>
          );
        })}
        {baselinePath === "" ? null : (
          <path d={baselinePath} fill="none" stroke="#9a9a9a" strokeDasharray="4 3" />
        )}
        <path
          d={candidatePath}
          fill="none"
          stroke={Option.isSome(ghost) ? "#0a6cff" : "#111111"}
          strokeWidth={Option.isSome(ghost) ? 1.5 : 1.2}
        />
        {markers.points.map((event, index) => {
          const x = fractionOf(event.t, span) * width;

          return (
            <path
              key={`${event.kind}-${String(event.t)}-${String(index)}`}
              d={`M${x.toFixed(1)} 22V${String(AXIS_Y)}`}
              stroke="#11111140"
              strokeDasharray="2 3"
            />
          );
        })}
        <path d={`M${head.toFixed(1)} 6V100`} stroke="#0a6cff" strokeWidth={1.5} />
        <circle cx={head} cy={headY} r={4} fill="#ffffff" stroke="#0a6cff" strokeWidth={1.5} />
      </svg>
      {markers.points.map((event, index) =>
        named[index] === true ? (
          <PillButton
            key={`${event.kind}-${String(event.t)}-${String(index)}`}
            tone={eventPillTone(event.kind)}
            size="xs"
            aria-label={`${event.kind} at ${fixed(event.t, 2)} seconds`}
            title={`${event.kind} at ${fixed(event.t, 2)} s`}
            onPointerDown={(pointer) => pointer.stopPropagation()}
            onClick={() => seekTo(registry, event.t)}
            className="absolute top-2 -translate-x-1/2"
            style={{ left: fractionOf(event.t, span) * width }}
          >
            {eventLabel(event.kind)}
          </PillButton>
        ) : null,
      )}
      <span
        className="pointer-events-none absolute -top-2 -translate-x-1/2 rounded-full bg-blue px-[7px] py-0.5 font-label text-[11px] leading-[14px] text-white tabular-nums"
        style={{ left: head }}
      >
        {fixed(t, 2)}
      </span>
      {Option.isNone(baselineEnd) ? null : (
        <span
          className="pointer-events-none absolute right-6 font-label text-[11px] leading-[14px] text-faint"
          style={{ top: Math.min(baselineEnd.value + 4, AXIS_Y - 16) }}
        >
          base
        </span>
      )}
      {ticks.map((tick) =>
        labelled.has(tick) ? (
          <span
            key={tick}
            className={cn(
              "pointer-events-none absolute top-[100px] font-label text-[11px] leading-[14px] whitespace-pre text-faint",
              tick === ticks[ticks.length - 1] && ticks.length > 1 ? "-translate-x-full" : "",
              tick !== ticks[0] && tick !== ticks[ticks.length - 1] ? "-translate-x-1/2" : "",
            )}
            style={{ left: fractionOf(tick, span) * width }}
          >
            {tick >= 60 ? clock(tick).slice(0, 5) : `${fixed(tick, tick % 1 === 0 ? 0 : 1)} s`}
          </span>
        ) : null,
      )}
    </div>
  );
};

const statusOf = (flight: Option.Option<FlightView>, following: boolean, transport: Transport) =>
  Option.match(flight, {
    onNone: () => "idle",
    onSome: (view) => {
      if (!view.live) return "replay";

      if (view.status?.finished === true) return "recorded";

      if (!following) return "scrubbing";

      return transport.playing ? "live" : "paused";
    },
  });

const QuietButton = ({
  pressed,
  onClick,
  children,
  label,
}: {
  readonly pressed?: boolean;
  readonly onClick: () => void;
  readonly children: string;
  readonly label: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={pressed}
    title={label}
    className={cn(
      "cursor-pointer font-label text-[11px] leading-[14px] transition-colors hover:text-ink",
      pressed === true ? "text-blue" : "text-faint",
    )}
  >
    {children}
  </button>
);

export const TimeMachine = () => {
  const flight = useAtomValue(activeFlight);
  const ghost = useAtomValue(ghostFlight);
  const loading = useAtomValue(activeRunLoading);
  const t = useAtomValue(playhead);
  const following = useAtomValue(followLive);
  const [charts, setCharts] = useAtom(telemetryOpen);
  const transport = useTransport();
  const status = statusOf(flight, following, transport);

  const total = Option.match(flight, {
    onNone: () => 0,
    onSome: (view) => spanOf(view).end,
  });

  return (
    <footer
      aria-label="Flight Time Machine"
      className="absolute inset-x-10 bottom-0 flex h-40 gap-10 px-6 pt-[22px] pb-6"
    >
      <div className="flex w-[180px] shrink-0 flex-col justify-between">
        <div className="flex flex-col gap-0.5">
          <p className="font-display text-[36px] leading-10 text-ink tabular-nums">
            {fixed(t, 2)} s
          </p>
          <p className="font-label text-[12px] leading-4 text-faint">
            of {fixed(total, 2)} · {loading ? "loading" : status}
            {status === "scrubbing" || (!transport.live && transport.hasLiveSession) ? (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={transport.goLive}
                  title="Follow the live session (L)"
                  className="cursor-pointer text-blue hover:underline"
                >
                  go live
                </button>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 font-label text-[11px] leading-[14px] text-faint hover:text-ink">
            <span className="sr-only">Speed</span>
            <select
              aria-label="Speed"
              value={String(transport.speed)}
              onChange={(event) => transport.setSpeed(Number(event.target.value))}
              className="cursor-pointer appearance-none bg-transparent outline-none"
            >
              {SPEEDS.map((speed) => (
                <option key={speed} value={String(speed)}>
                  {String(speed)}×
                </option>
              ))}
            </select>
          </label>
          <QuietButton onClick={transport.reset} label="Restart (R)">
            reset
          </QuietButton>
          <QuietButton
            pressed={charts}
            onClick={() => setCharts(!charts)}
            label="Charts and firmware log (T)"
          >
            {charts ? "charts ▾" : "charts ▴"}
          </QuietButton>
        </div>
      </div>
      {Option.match(flight, {
        onNone: () => (
          <div className="relative min-w-0 flex-1" style={{ height: HEIGHT }}>
            <span className="absolute inset-x-0 h-px bg-line-strong" style={{ top: AXIS_Y }} />
            <p className="absolute top-12 left-0 font-label text-[12px] text-faint">
              {loading
                ? "loading run…"
                : "press play or open a run; the timeline fills as the drone flies"}
            </p>
          </div>
        ),
        onSome: (view) => <Track flight={view} ghost={ghost} t={t} />,
      })}
    </footer>
  );
};
