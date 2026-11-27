import { cn } from "@drone-studio/ui/lib/utils";
import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { Option } from "effect";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

import { eventColor, eventLabel } from "../../../shared/event-style.ts";
import { clock, fixed } from "../../../shared/format.ts";
import { PauseIcon, PlayIcon, ResetIcon } from "../../../shared/icons.tsx";
import { PALETTE } from "../../../shared/palette.ts";
import {
  activeFlight,
  activeRunLoading,
  followLive,
  ghostFlight,
  playhead,
} from "../../../shared/studio.atoms.ts";
import type { FlightView } from "../../../shared/studio.atoms.ts";
import { useTransport } from "../../../shared/transport.ts";
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

const HEIGHT = 141;

const TOP = 22;

const BOTTOM = 118;

const PLOTTED = "height";

const BAND_FILLS: ReadonlyMap<string, string> = new Map([
  ["GUST_START", "#38a3e81a"],
  ["SATURATION", "#e58a0024"],
  ["FAULT", "#d6409f1a"],
]);

const spanOf = (flight: FlightView): Span => ({
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

const tickLabel = (tick: number) =>
  tick >= 60 ? clock(tick).slice(0, 5) : `${fixed(tick, tick % 1 === 0 ? 0 : 1)}s`;

interface TrackProps {
  readonly flight: FlightView;
  readonly ghost: Option.Option<FlightView>;
  readonly t: number;
}

const Track = ({ flight, ghost, t }: TrackProps) => {
  const registry = useContext(RegistryContext);
  const { element, width } = useTrackWidth();
  const span = spanOf(flight);
  const x = (time: number) => fractionOf(time, span) * width;

  const markers = useMemo(
    () => timelineMarkers(flight.events, flight.table.endTime),
    [flight.events, flight.table.endTime],
  );

  const anomalies = useMemo(() => anomalyBands(flight.anomalies), [flight.anomalies]);

  const namedAnomalies = labelledMarkers(
    anomalies.map((band) => band.start),
    span,
    width,
    150,
  );

  const ticks = rulerTicks(span, width, 60);
  const head = x(t);
  const recorded = x(flight.table.endTime);

  const named = labelledMarkers(
    markers.points.map((event) => event.t),
    span,
    width,
    70,
  );

  const box = { width, top: TOP + 8, bottom: BOTTOM - 14 };

  const comparison = Option.map(ghost, (other) => {
    const range = valueRange([flight.table, other.table], PLOTTED, span.end);

    return {
      candidate: seriesPath(flight.table, PLOTTED, span, range, box),
      baseline: seriesPath(other.table, PLOTTED, span, range, box),
      label: plotY(other.table.sample(PLOTTED, span.end), range, box),
    };
  });

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
      className="relative min-w-0 flex-1 cursor-ew-resize touch-none outline-none select-none"
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
        <rect
          x={0.5}
          y={TOP}
          width={Math.max(width - 1, 0)}
          height={BOTTOM - TOP}
          fill="#ffffff"
          stroke={PALETTE.line}
        />
        <rect x={0} y={TOP} width={recorded} height={BOTTOM - TOP} fill="#0a6cff08" />
        {markers.bands.map((band) => (
          <rect
            key={`${band.kind}-${String(band.start)}`}
            x={x(band.start)}
            y={TOP}
            width={Math.max(x(band.end) - x(band.start), 1)}
            height={BOTTOM - TOP}
            fill={BAND_FILLS.get(band.kind) ?? "#1111110a"}
          />
        ))}
        {anomalies.map((band) => (
          <rect
            key={`anomaly-${band.kind}-${String(band.start)}`}
            x={x(band.start)}
            y={BOTTOM - 6}
            width={Math.max(x(band.end) - x(band.start), 3)}
            height={6}
            fill="#e58a00b3"
          />
        ))}
        {Option.match(comparison, {
          onNone: () => null,
          onSome: (paths) => (
            <>
              <path d={paths.baseline} fill="none" stroke={PALETTE.ghost} strokeDasharray="4 3" />
              <path d={paths.candidate} fill="none" stroke={PALETTE.blue} strokeWidth={1.4} />
            </>
          ),
        })}
        {markers.points.map((event, index) => {
          const at = x(event.t);
          const color = eventColor(event.kind);

          return (
            <g key={`${event.kind}-${String(event.t)}-${String(index)}`}>
              <path
                d={`M${at.toFixed(1)} ${String(TOP)}V${String(BOTTOM)}`}
                stroke={color === PALETTE.ink ? "#11111159" : `${color}99`}
              />
              <path
                d={`M${String(at - 4)} ${String(TOP)}L${String(at)} ${String(TOP - 4)}L${String(at + 4)} ${String(TOP)}L${String(at)} ${String(TOP + 4)}Z`}
                fill={color}
              />
            </g>
          );
        })}
        {ticks.map((tick) => (
          <path
            key={tick}
            d={`M${x(tick).toFixed(1)} ${String(BOTTOM)}V${String(BOTTOM + (labelled.has(tick) ? 6 : 4))}`}
            stroke={PALETTE.lineStrong}
          />
        ))}
        <path d={`M${head.toFixed(1)} 8V128`} stroke={PALETTE.blue} strokeWidth={1.5} />
        <path
          d={`M${String(head - 6)} 8H${String(head + 6)}L${String(head)} 15Z`}
          fill={PALETTE.blue}
        />
      </svg>
      {markers.points.map((event, index) =>
        named[index] === true ? (
          <button
            key={`${event.kind}-${String(event.t)}-${String(index)}`}
            type="button"
            aria-label={`${event.kind} at ${fixed(event.t, 2)} seconds`}
            title={`${event.kind} at ${fixed(event.t, 2)} s`}
            onPointerDown={(pointer) => pointer.stopPropagation()}
            onClick={() => seekTo(registry, event.t)}
            className="absolute top-[28px] cursor-pointer font-label text-[10px] leading-3 whitespace-nowrap hover:underline"
            style={{ left: x(event.t) + 6, color: eventColor(event.kind) }}
          >
            {eventLabel(event.kind)}
          </button>
        ) : null,
      )}
      {anomalies.map((band, index) =>
        namedAnomalies[index] === true ? (
          <span
            key={`anomaly-label-${band.kind}-${String(band.start)}`}
            className="pointer-events-none absolute top-[96px] font-label text-[9px] leading-3 whitespace-nowrap text-amber"
            style={{ left: x(band.start) + 6 }}
          >
            anomaly: {band.kind}
          </span>
        ) : null,
      )}
      {Option.match(comparison, {
        onNone: () => null,
        onSome: (paths) => (
          <span
            className="pointer-events-none absolute right-4 font-label text-[10px] leading-3 text-ghost"
            style={{ top: Math.min(Math.max(paths.label - 16, TOP + 2), BOTTOM - 26) }}
          >
            ghost
          </span>
        ),
      })}
      {ticks.map((tick) =>
        labelled.has(tick) ? (
          <span
            key={tick}
            className={cn(
              "pointer-events-none absolute top-[127px] font-label text-[10px] leading-3 whitespace-pre text-faint",
              tick === ticks[ticks.length - 1] && ticks.length > 1 ? "-translate-x-full" : "",
              tick !== ticks[0] && tick !== ticks[ticks.length - 1] ? "-translate-x-1/2" : "",
            )}
            style={{ left: x(tick) }}
          >
            {tickLabel(tick)}
          </span>
        ) : null,
      )}
    </div>
  );
};

export const TimeMachine = () => {
  const flight = useAtomValue(activeFlight);
  const ghost = useAtomValue(ghostFlight);
  const loading = useAtomValue(activeRunLoading);
  const t = useAtomValue(playhead);
  const following = useAtomValue(followLive);
  const transport = useTransport();
  const live = transport.live && following;

  return (
    <footer aria-label="Flight Time Machine" className="flex h-[175px] gap-6 px-5 pt-4 pb-[18px]">
      <div className="flex w-[176px] shrink-0 flex-col justify-between">
        <div className="flex flex-col gap-[3px] font-label text-[11px] leading-[14px]">
          <h2 className="font-normal text-ink-soft">FLIGHT TIME MACHINE</h2>
          <p className="text-muted">
            {Option.match(flight, {
              onNone: () => (loading ? "loading run…" : "no flight yet: press Play or open a run"),
              onSome: (view) => `${view.live ? "LIVE" : "REPLAY"} · ${view.label}`,
            })}
          </p>
          {Option.isSome(ghost) ? <p className="text-ghost">vs ghost · base</p> : null}
        </div>
        <div className="flex flex-col gap-2">
          <p className="font-label text-[16px] leading-5 whitespace-pre text-ink tabular-nums">
            {clock(t)}{" "}
            <span className="text-faint">
              /{" "}
              {Option.match(flight, {
                onNone: () => clock(0),
                onSome: (view) => clock(spanOf(view).end),
              })}
            </span>
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={transport.toggle}
              aria-label={transport.playing ? "Pause" : "Play"}
              className="flex size-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-ink text-white hover:bg-ink-soft"
            >
              {transport.playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button
              type="button"
              onClick={transport.reset}
              aria-label="Reset"
              className="flex size-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full border border-line-strong bg-surface text-ink hover:border-ink"
            >
              <ResetIcon className="size-3" />
            </button>
            <button
              type="button"
              onClick={transport.goLive}
              title={live ? "Following the live session (L)" : "Back to the live session (L)"}
              className={cn(
                "flex h-[30px] cursor-pointer items-center gap-1.5 rounded-full border bg-surface px-2.5 font-label text-[11px] leading-[14px] whitespace-pre",
                live ? "border-fail text-fail" : "border-line-strong text-ink",
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-[3px]",
                  live ? "animate-pulse bg-fail" : "bg-faint",
                )}
              />
              {transport.live ? "LIVE" : "BACK TO LIVE"}
              <kbd className="text-[10px] leading-3 text-faint">L</kbd>
            </button>
          </div>
        </div>
      </div>
      {Option.match(flight, {
        onNone: () => (
          <div className="mt-[22px] flex h-24 min-w-0 flex-1 items-center justify-center border border-dashed border-line-strong">
            <p className="text-[13px] leading-4 text-muted">
              The timeline fills as the drone flies.
            </p>
          </div>
        ),
        onSome: (view) => <Track flight={view} ghost={ghost} t={t} />,
      })}
    </footer>
  );
};
