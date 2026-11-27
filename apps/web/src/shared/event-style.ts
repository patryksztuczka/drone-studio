export type EventTone = "arm" | "gust" | "warn" | "danger" | "info" | "fault";

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
  arm: "#22d3ee",
  gust: "#7dd3fc",
  warn: "#f5a524",
  danger: "#f05252",
  fault: "#f472b6",
  info: "#7b8698",
};

export const eventColor = (kind: string) => COLORS[eventTone(kind)];

const MARKED: ReadonlySet<EventTone> = new Set(["arm", "gust", "warn", "danger", "fault"]);

export const isMarkerEvent = (kind: string) => MARKED.has(eventTone(kind));
