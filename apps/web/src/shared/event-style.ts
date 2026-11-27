import { PALETTE } from "./palette.ts";

export type EventTone = "arm" | "gust" | "warn" | "danger" | "fault" | "info";

const TONES: ReadonlyMap<string, EventTone> = new Map([
  ["ARM", "arm"],
  ["DISARM", "arm"],
  ["TOUCHDOWN", "arm"],
  ["LANDED", "arm"],
  ["GUST_START", "gust"],
  ["GUST_END", "gust"],
  ["SATURATION", "warn"],
  ["SATURATION_END", "warn"],
  ["BATTERY_WARNING", "warn"],
  ["ARM_REJECTED", "warn"],
  ["RC_LOST", "danger"],
  ["FAILSAFE", "danger"],
  ["BATTERY_CRITICAL", "danger"],
  ["CRASH", "danger"],
  ["ASSERT_FAIL", "danger"],
  ["FAULT", "fault"],
  ["FAULT_CLEARED", "fault"],
]);

export const eventTone = (kind: string): EventTone => TONES.get(kind) ?? "info";

const COLORS: Readonly<Record<EventTone, string>> = {
  arm: PALETTE.ink,
  gust: PALETTE.gust,
  warn: PALETTE.amber,
  danger: PALETTE.fail,
  fault: PALETTE.magenta,
  info: PALETTE.ink,
};

export const eventColor = (kind: string) => COLORS[eventTone(kind)];

export const eventLabel = (kind: string) => kind.replace("_START", "");

const MARKED: ReadonlySet<EventTone> = new Set(["arm", "gust", "warn", "danger", "fault"]);

export const isMarkerEvent = (kind: string) => MARKED.has(eventTone(kind));
