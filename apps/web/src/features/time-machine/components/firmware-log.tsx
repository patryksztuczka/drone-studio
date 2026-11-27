import type { FlightEvent } from "@drone-studio/engine-client";
import { cn } from "@drone-studio/ui/lib/utils";
import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { Option, Schema } from "effect";
import { useContext, useEffect, useRef } from "react";

import { eventColor, eventTone } from "../../../shared/event-style.ts";
import { fixed } from "../../../shared/format.ts";
import { activeFlight, playhead } from "../../../shared/studio.atoms.ts";
import { latestEventIndex } from "../timeline-math.ts";
import { seekTo } from "./use-playback.ts";

const EventData = Schema.Struct({
  level: Schema.optional(Schema.String),
  args: Schema.optional(Schema.Array(Schema.Number)),
  wind_mps: Schema.optional(Schema.Array(Schema.Number)),
});

const decodeEventData = Schema.decodeUnknownOption(EventData);

const LEVEL_CLASSES: ReadonlyMap<string, string> = new Map([
  ["error", "text-fail"],
  ["warn", "text-amber"],
]);

const levelOf = (event: FlightEvent) =>
  Option.getOrElse(
    Option.flatMap(decodeEventData(event.data), (data) => Option.fromUndefinedOr(data.level)),
    () => {
      const tone = eventTone(event.kind);

      if (tone === "danger") return "error";

      return tone === "warn" ? "warn" : "info";
    },
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

export const FirmwareLog = () => {
  const registry = useContext(RegistryContext);
  const flight = useAtomValue(activeFlight);
  const t = useAtomValue(playhead);
  const list = useRef<HTMLOListElement>(null);
  const events = Option.match(flight, { onNone: () => [], onSome: (view) => view.events });
  const latest = latestEventIndex(events, t);

  useEffect(() => {
    const item = list.current?.querySelector<HTMLElement>(`[data-index="${String(latest)}"]`);

    item?.scrollIntoView({ block: "nearest" });
  }, [latest]);

  return (
    <section aria-label="Firmware log" className="flex h-[175px] flex-col px-5 py-4">
      <header className="flex justify-between pb-2 font-label text-[11px] leading-[14px]">
        <h2 className="font-normal text-ink-soft">FIRMWARE LOG</h2>
        <span className="text-faint tabular-nums">
          {String(latest + 1)}/{String(events.length)}
        </span>
      </header>
      <ol ref={list} className="-mx-1.5 min-h-0 flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <li className="px-1.5 text-[13px] leading-4 text-muted">No events yet.</li>
        ) : null}
        {events.map((event, index) => {
          const level = levelOf(event);
          const current = index === latest;
          const color = eventColor(event.kind);

          return (
            <li key={`${String(event.t)}-${event.kind}-${String(index)}`} data-index={index}>
              <button
                type="button"
                onClick={() => seekTo(registry, event.t)}
                className={cn(
                  "flex w-full cursor-pointer items-baseline gap-2.5 px-1.5 py-[3px] text-left font-label hover:bg-background",
                  current ? "bg-blue-soft hover:bg-blue-soft" : undefined,
                  index > latest ? "opacity-35" : undefined,
                )}
              >
                <span
                  className={cn(
                    "w-11 shrink-0 text-[11px] leading-[14px] tabular-nums",
                    current ? "text-ink" : "text-faint",
                  )}
                >
                  {fixed(event.t, 3)}
                </span>
                <span
                  className={cn(
                    "w-9 shrink-0 text-[10px] leading-3",
                    LEVEL_CLASSES.get(level) ?? "text-faint",
                  )}
                >
                  {level}
                </span>
                <span className="min-w-0 truncate text-[11px] leading-[14px]" style={{ color }}>
                  {event.kind}
                  <span className="text-faint"> {detailOf(event)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
