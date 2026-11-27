import type { Anomaly, FlightEvent } from "@drone-studio/engine-client";

import { isMarkerEvent } from "../../shared/event-style.ts";

export interface Span {
  readonly start: number;
  readonly end: number;
}

export const fractionOf = (t: number, span: Span) => {
  const length = span.end - span.start;

  return length <= 0 ? 0 : Math.min(Math.max((t - span.start) / length, 0), 1);
};

export const timeAt = (fraction: number, span: Span) =>
  span.start + Math.min(Math.max(fraction, 0), 1) * (span.end - span.start);

const TICK_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];

export const rulerTicks = (span: Span, widthPx: number, minimumGapPx = 64) => {
  const length = span.end - span.start;

  if (length <= 0 || widthPx <= 0) return [];

  const step =
    TICK_STEPS.find((candidate) => (candidate / length) * widthPx >= minimumGapPx) ?? 600;

  const first = Math.ceil(span.start / step - 1e-9) * step;
  const count = Math.floor((span.end - first) / step + 1e-9) + 1;

  return Array.from({ length: Math.max(count, 0) }, (_, index) =>
    Number((first + index * step).toFixed(3)),
  );
};

const PAIRS: ReadonlyMap<string, string> = new Map([
  ["GUST_START", "GUST_END"],
  ["SATURATION", "SATURATION_END"],
  ["FAULT", "FAULT_CLEARED"],
]);

const CLOSERS: ReadonlySet<string> = new Set(PAIRS.values());

export interface Band {
  readonly kind: string;
  readonly start: number;
  readonly end: number;
}

export interface Markers {
  readonly points: ReadonlyArray<FlightEvent>;
  readonly bands: ReadonlyArray<Band>;
}

export const timelineMarkers = (events: ReadonlyArray<FlightEvent>, end: number): Markers => {
  const open = new Map<string, number>();
  const bands: Array<Band> = [];
  const points: Array<FlightEvent> = [];

  for (const event of events) {
    const closer = PAIRS.get(event.kind);

    if (closer !== undefined) {
      open.set(closer, event.t);
      points.push(event);
    } else if (CLOSERS.has(event.kind)) {
      const start = open.get(event.kind);

      if (start !== undefined) {
        const opener =
          [...PAIRS.entries()].find(([, value]) => value === event.kind)?.[0] ?? event.kind;

        bands.push({ kind: opener, start, end: event.t });
        open.delete(event.kind);
      }
    } else if (isMarkerEvent(event.kind)) {
      points.push(event);
    }
  }

  for (const [closer, start] of open) {
    const opener = [...PAIRS.entries()].find(([, value]) => value === closer)?.[0] ?? closer;

    bands.push({ kind: opener, start, end });
  }

  const merged = mergeBands(bands);
  const starts = new Set(merged.map((band) => `${band.kind}@${String(band.start)}`));

  return {
    points: points.filter(
      (event) => !PAIRS.has(event.kind) || starts.has(`${event.kind}@${String(event.t)}`),
    ),
    bands: merged,
  };
};

export const BAND_MERGE_GAP_S = 1;

export const mergeBands = (bands: ReadonlyArray<Band>): ReadonlyArray<Band> => {
  const sorted = [...bands].sort((a, b) => a.start - b.start);
  const merged: Array<Band> = [];

  for (const band of sorted) {
    const index = merged.findLastIndex((candidate) => candidate.kind === band.kind);
    const previous = merged[index];

    if (previous !== undefined && band.start - previous.end <= BAND_MERGE_GAP_S) {
      merged[index] = { ...previous, end: Math.max(previous.end, band.end) };
    } else {
      merged.push(band);
    }
  }

  return merged;
};

export const anomalyBands = (anomalies: ReadonlyArray<Anomaly>): ReadonlyArray<Band> =>
  mergeBands(
    anomalies.map((anomaly) => ({
      kind: anomaly.kind,
      start: anomaly.t_start,
      end: anomaly.t_end,
    })),
  );

export interface Advance {
  readonly t: number;
  readonly ended: boolean;
}

export const advancePlayback = (t: number, dt: number, rate: number, span: Span): Advance => {
  const next = t + Math.max(dt, 0) * rate;

  return next >= span.end
    ? { t: span.end, ended: true }
    : { t: Math.max(next, span.start), ended: false };
};

export const seekStep = (t: number, direction: -1 | 1, coarse: boolean, span: Span) =>
  Math.min(Math.max(t + direction * (coarse ? 1 : 0.1), span.start), span.end);

export const latestEventIndex = (events: ReadonlyArray<FlightEvent>, t: number) => {
  let latest = -1;

  events.forEach((event, index) => {
    if (event.t <= t + 1e-6) latest = index;
  });

  return latest;
};

export const LIVE_HORIZON_S = 30;

export const liveSpanEnd = (recordedEnd: number, sessionDuration: number) =>
  Math.max(recordedEnd, Math.min(sessionDuration, Math.max(LIVE_HORIZON_S, recordedEnd * 1.2)));

export const labelledMarkers = (
  times: ReadonlyArray<number>,
  span: Span,
  widthPx: number,
  gapPx = 56,
) => {
  let last = Number.NEGATIVE_INFINITY;

  return times.map((t) => {
    const x = fractionOf(t, span) * widthPx;
    const labelled = x - last >= gapPx;

    if (labelled) last = x;

    return labelled;
  });
};
