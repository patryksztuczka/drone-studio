import type { FlightEvent } from "@drone-studio/engine-client";
import { cn } from "@drone-studio/ui/lib/utils";
import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { Option, Schema } from "effect";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";

import { eventColor, eventTone } from "../../../shared/event-style.ts";
import { clock, fixed } from "../../../shared/format.ts";
import { PauseIcon, PlayIcon, ResetIcon } from "../../../shared/icons.tsx";
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
  latestEventIndex,
  liveSpanEnd,
  rulerTicks,
  timeAt,
  timelineMarkers,
} from "../timeline-math.ts";
import type { Span } from "../timeline-math.ts";
import { seekTo } from "./use-playback.ts";

const BAND_COLORS: ReadonlyMap<string, string> = new Map([
  ["GUST_START", "#7dd3fc"],
  ["SATURATION", "#f5a524"],
  ["FAULT", "#f472b6"],
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

interface TrackProps {
  readonly flight: FlightView;
  readonly t: number;
}

const Track = ({ flight, t }: TrackProps) => {
  const registry = useContext(RegistryContext);
  const { element, width } = useTrackWidth();
  const span = spanOf(flight);

  const markers = useMemo(
    () => timelineMarkers(flight.events, flight.table.endTime),
    [flight.events, flight.table.endTime],
  );

  const anomalies = useMemo(() => anomalyBands(flight.anomalies), [flight.anomalies]);
  const ticks = rulerTicks(span, width);
  const recorded = fractionOf(flight.table.endTime, span);
  const head = fractionOf(t, span);

  const named = labelledMarkers(
    markers.points.map((event) => event.t),
    span,
    width,
  );

  const seekFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientX - box.left) / Math.max(box.width, 1);

    seekTo(registry, Math.min(timeAt(fraction, span), flight.table.endTime));
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
      className="group relative h-full min-w-0 flex-1 cursor-ew-resize touch-none select-none outline-none"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        seekFromPointer(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) seekFromPointer(event);
      }}
    >
      <div className="absolute inset-x-0 top-0 h-4">
        {ticks.map((tick) => (
          <span
            key={tick}
            className="absolute top-0 -translate-x-1/2 font-mono text-[9px] text-faint tabular-nums"
            style={{ left: `${String(fractionOf(tick, span) * 100)}%` }}
          >
            {tick >= 60 ? clock(tick).slice(0, 5) : `${fixed(tick, tick % 1 === 0 ? 0 : 1)}s`}
          </span>
        ))}
      </div>
      <div className="absolute inset-x-0 top-5 bottom-1 overflow-hidden rounded-md border border-hairline bg-[#0d1118]">
        {ticks.map((tick) => (
          <span
            key={tick}
            className="absolute inset-y-0 w-px bg-hairline"
            style={{ left: `${String(fractionOf(tick, span) * 100)}%` }}
          />
        ))}
        <div
          className="absolute inset-y-0 left-0 bg-[linear-gradient(90deg,#22d3ee0f,#22d3ee1f)]"
          style={{ width: `${String(recorded * 100)}%` }}
        />
        {markers.bands.map((band) => (
          <div
            key={`${band.kind}-${String(band.start)}`}
            title={`${band.kind.replace("_START", "")} ${fixed(band.start, 2)}–${fixed(band.end, 2)} s`}
            className="absolute top-1 bottom-1 rounded-sm"
            style={{
              left: `${String(fractionOf(band.start, span) * 100)}%`,
              width: `${String(Math.max((fractionOf(band.end, span) - fractionOf(band.start, span)) * 100, 0.3))}%`,
              background: `${BAND_COLORS.get(band.kind) ?? "#7b8698"}22`,
              borderTop: `1.5px solid ${BAND_COLORS.get(band.kind) ?? "#7b8698"}88`,
            }}
          />
        ))}
        {anomalies.map((band) => (
          <div
            key={`${band.kind}-${String(band.start)}`}
            title={`anomaly: ${band.kind}`}
            className="absolute bottom-0 h-[3px] bg-emu/70"
            style={{
              left: `${String(fractionOf(band.start, span) * 100)}%`,
              width: `${String(Math.max((fractionOf(band.end, span) - fractionOf(band.start, span)) * 100, 0.4))}%`,
            }}
          />
        ))}
        {markers.points.map((event, index) => (
          <button
            key={`${event.kind}-${String(event.t)}-${String(index)}`}
            type="button"
            title={`${event.kind} at ${fixed(event.t, 2)} s`}
            aria-label={`${event.kind} at ${fixed(event.t, 2)} seconds`}
            onPointerDown={(pointer) => pointer.stopPropagation()}
            onClick={() => seekTo(registry, event.t)}
            className="absolute top-0 bottom-0 flex w-3 -translate-x-1/2 flex-col items-center"
            style={{ left: `${String(fractionOf(event.t, span) * 100)}%` }}
          >
            <span className="w-px flex-1" style={{ background: `${eventColor(event.kind)}99` }} />
            <span
              className="absolute top-1 size-[7px] rotate-45 rounded-[1px]"
              style={{
                background: eventColor(event.kind),
                boxShadow: `0 0 8px ${eventColor(event.kind)}`,
              }}
            />
            {named[index] === true ? (
              <span
                className="absolute top-3.5 left-2 font-mono text-[8.5px] font-medium tracking-wide whitespace-nowrap opacity-80"
                style={{ color: eventColor(event.kind) }}
              >
                {event.kind.replace("_START", "")}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div
        className="pointer-events-none absolute top-4 bottom-0 w-px bg-sim shadow-[0_0_10px_#22d3ee]"
        style={{ left: `${String(head * 100)}%` }}
      >
        <span className="absolute -top-1 left-1/2 size-2.5 -translate-x-1/2 rotate-45 rounded-[2px] bg-sim" />
      </div>
    </div>
  );
};

interface ConsoleProps {
  readonly events: ReadonlyArray<FlightEvent>;
  readonly t: number;
}

const EventData = Schema.Struct({
  level: Schema.optional(Schema.String),
  args: Schema.optional(Schema.Array(Schema.Number)),
  wind_mps: Schema.optional(Schema.Array(Schema.Number)),
});

const decodeEventData = Schema.decodeUnknownOption(EventData);

const LEVEL_COLORS: ReadonlyMap<string, string> = new Map([
  ["error", "#f05252"],
  ["warn", "#f5a524"],
]);

const levelOf = (event: FlightEvent) =>
  Option.getOrElse(
    Option.flatMap(decodeEventData(event.data), (data) => Option.fromUndefinedOr(data.level)),
    () => (eventTone(event.kind) === "danger" ? "error" : "info"),
  );

const detailOf = (event: FlightEvent) =>
  Option.match(decodeEventData(event.data), {
    onNone: () => "",
    onSome: (data) => {
      if (data.wind_mps !== undefined) {
        return `wind ${data.wind_mps.map((value) => value.toFixed(2)).join(" ")} m/s`;
      }

      return data.args === undefined ? "" : `args ${data.args.join(", ")}`;
    },
  });

const EventConsole = ({ events, t }: ConsoleProps) => {
  const registry = useContext(RegistryContext);
  const list = useRef<HTMLOListElement>(null);
  const latest = latestEventIndex(events, t);

  useEffect(() => {
    const item = list.current?.querySelector<HTMLElement>(`[data-index="${String(latest)}"]`);

    item?.scrollIntoView({ block: "nearest" });
  }, [latest]);

  return (
    <section
      aria-label="Firmware log"
      className="flex min-h-0 w-[min(40%,460px)] shrink-0 flex-col border-l border-hairline"
    >
      <header className="flex h-7 items-center justify-between px-3 text-[10px] font-medium tracking-[0.14em] text-faint">
        <span>FIRMWARE LOG</span>
        <span className="font-mono tracking-normal">
          {String(latest + 1)}/{String(events.length)}
        </span>
      </header>
      <ol ref={list} className="min-h-0 flex-1 overflow-y-auto px-1 pb-1.5 font-mono text-[11px]">
        {events.length === 0 ? <li className="px-2 py-1 text-faint">No events yet.</li> : null}
        {events.map((event, index) => {
          const future = index > latest;
          const level = levelOf(event);

          return (
            <li key={`${String(event.t)}-${event.kind}-${String(index)}`} data-index={index}>
              <button
                type="button"
                onClick={() => seekTo(registry, event.t)}
                className={cn(
                  "flex w-full items-baseline gap-2 rounded px-2 py-[3px] text-left hover:bg-panel-raised",
                  index === latest ? "bg-[#22d3ee12]" : undefined,
                  future ? "opacity-35" : undefined,
                )}
              >
                <span className="w-14 shrink-0 text-faint tabular-nums">{fixed(event.t, 3)}</span>
                <span
                  className="w-10 shrink-0 text-[9px] uppercase"
                  style={{ color: LEVEL_COLORS.get(level) ?? "#4a5466" }}
                >
                  {level}
                </span>
                <span className="shrink-0" style={{ color: eventColor(event.kind) }}>
                  {event.kind}
                </span>
                <span className="truncate text-muted-foreground">{detailOf(event)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
};

export const TimeMachine = () => {
  const flight = useAtomValue(activeFlight);
  const ghost = useAtomValue(ghostFlight);
  const loading = useAtomValue(activeRunLoading);
  const t = useAtomValue(playhead);
  const following = useAtomValue(followLive);
  const transport = useTransport();

  return (
    <footer
      aria-label="Flight Time Machine"
      className="flex h-[152px] shrink-0 border-t border-hairline bg-panel"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2 px-3 pt-2 pb-2">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-semibold tracking-[0.16em] text-faint">
            FLIGHT TIME MACHINE
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">
            {Option.match(flight, {
              onNone: () => (loading ? "loading run…" : "no flight yet: press Play or open a run"),
              onSome: (view) => (view.live ? `LIVE · ${view.label}` : `REPLAY · ${view.label}`),
            })}
          </span>
          {Option.isSome(ghost) ? (
            <span className="font-mono text-[11px] text-ghost">vs ghost · {ghost.value.label}</span>
          ) : null}
          <span className="ml-auto flex items-center gap-2">
            {transport.live ? (
              <button
                type="button"
                onClick={transport.goLive}
                className={cn(
                  "flex h-6 items-center gap-1.5 rounded-md border px-2 font-mono text-[10px] tracking-[0.14em]",
                  following
                    ? "border-[#f0525255] text-[#fca5a5]"
                    : "border-hairline text-muted-foreground hover:text-foreground",
                )}
                title="Follow the live session (L)"
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    following ? "animate-pulse bg-danger" : "bg-faint",
                  )}
                />
                LIVE
              </button>
            ) : (
              <button
                type="button"
                onClick={transport.goLive}
                className="flex h-6 items-center rounded-md border border-hairline px-2 font-mono text-[10px] tracking-[0.14em] text-muted-foreground hover:text-foreground"
                title="Back to the live session (L)"
              >
                BACK TO LIVE
              </button>
            )}
          </span>
        </div>
        <div className="flex min-h-0 flex-1 items-stretch gap-3">
          <div className="flex shrink-0 flex-col justify-center gap-1.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={transport.toggle}
                aria-label={transport.playing ? "Pause" : "Play"}
                className="flex size-8 items-center justify-center rounded-md bg-sim/15 text-sim hover:bg-sim/25"
              >
                {transport.playing ? <PauseIcon /> : <PlayIcon />}
              </button>
              <button
                type="button"
                onClick={transport.reset}
                aria-label="Reset"
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-panel-raised hover:text-foreground"
              >
                <ResetIcon />
              </button>
            </div>
            <span className="font-mono text-[13px] text-foreground tabular-nums">
              {clock(t)}
              <span className="text-faint">
                {" / "}
                {Option.match(flight, {
                  onNone: () => clock(0),
                  onSome: (view) => clock(spanOf(view).end),
                })}
              </span>
            </span>
          </div>
          {Option.match(flight, {
            onNone: () => (
              <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-hairline font-mono text-[11px] text-faint">
                The timeline fills as the drone flies.
              </div>
            ),
            onSome: (view) => <Track flight={view} t={t} />,
          })}
        </div>
      </div>
      <EventConsole
        events={Option.match(flight, { onNone: () => [], onSome: (view) => view.events })}
        t={t}
      />
    </footer>
  );
};
