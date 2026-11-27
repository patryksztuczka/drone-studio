import type { FlightEvent } from "@drone-studio/engine-client";
import { cn } from "@drone-studio/ui/lib/utils";
import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { Option, Schema } from "effect";
import { useContext, useEffect, useRef } from "react";

import { eventTone } from "../../../shared/event-style.ts";
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
    <ol
      ref={list}
      aria-label="Firmware log"
      className="min-h-0 flex-1 overflow-y-auto font-label text-[11px] leading-[14px]"
    >
      {events.length === 0 ? <li className="py-1 text-faint">No events yet.</li> : null}
      {events.map((event, index) => {
        const level = levelOf(event);

        return (
          <li key={`${String(event.t)}-${event.kind}-${String(index)}`} data-index={index}>
            <button
              type="button"
              onClick={() => seekTo(registry, event.t)}
              className={cn(
                "flex w-full cursor-pointer items-baseline gap-2 px-1 py-[3px] text-left hover:bg-background",
                index === latest ? "bg-blue-soft" : undefined,
                index > latest ? "opacity-40" : undefined,
              )}
            >
              <span className="w-12 shrink-0 text-faint tabular-nums">{fixed(event.t, 3)}</span>
              <span className={cn("w-9 shrink-0", LEVEL_CLASSES.get(level) ?? "text-faint")}>
                {level}
              </span>
              <span className="shrink-0 text-ink">{event.kind}</span>
              <span className="truncate text-muted">{detailOf(event)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
};
