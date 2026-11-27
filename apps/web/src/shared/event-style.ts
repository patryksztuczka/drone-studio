export type EventTone = "arm" | "gust" | "warn" | "danger" | "fault" | "info";

const TONES: ReadonlyMap<string, EventTone> = new Map([
  ["ARM", "arm"],
  ["DISARM", "arm"],
  ["TOUCHDOWN", "arm"],
  ["LANDED", "arm"],
  ["GUST_START", "gust"],
  ["GUST_END", "gust"],
  ["SATURATION", "danger"],
  ["SATURATION_END", "danger"],
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

export type PillTone = "neutral" | "fail" | "emu";

const PILLS: Readonly<Record<EventTone, PillTone>> = {
  arm: "neutral",
  gust: "neutral",
  info: "neutral",
  warn: "emu",
  danger: "fail",
  fault: "fail",
};

export const eventPillTone = (kind: string): PillTone => PILLS[eventTone(kind)];

export const eventLabel = (kind: string) => kind.replace("_START", "");

const MARKED: ReadonlySet<EventTone> = new Set(["arm", "gust", "warn", "danger", "fault"]);

export const isMarkerEvent = (kind: string) => MARKED.has(eventTone(kind));
