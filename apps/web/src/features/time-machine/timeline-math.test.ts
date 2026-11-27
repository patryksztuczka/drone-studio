import { describe, expect, it } from "vite-plus/test";

import {
  advancePlayback,
  fractionOf,
  labelledMarkers,
  latestEventIndex,
  liveSpanEnd,
  rulerTicks,
  seekStep,
  timeAt,
  timelineMarkers,
} from "./timeline-math.ts";

const span = { start: 0, end: 12 };

describe("timeline math", () => {
  it("maps time to a fraction of the track and back, clamped to the run", () => {
    expect(fractionOf(3, span)).toBeCloseTo(0.25);
    expect(fractionOf(-1, span)).toBe(0);
    expect(timeAt(0.5, span)).toBe(6);
    expect(timeAt(2, span)).toBe(12);
    expect(fractionOf(1, { start: 2, end: 2 })).toBe(0);
  });

  it("picks a ruler step that keeps labels at least the minimum gap apart", () => {
    expect(rulerTicks(span, 600)).toEqual([0, 2, 4, 6, 8, 10, 12]);
    expect(rulerTicks({ start: 0.3, end: 1.3 }, 900)).toEqual([
      0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3,
    ]);
    expect(rulerTicks(span, 0)).toEqual([]);
  });

  it("turns paired events into bands and keeps the rest as markers", () => {
    const markers = timelineMarkers(
      [
        { t: 0, kind: "BOOT" },
        { t: 0.5, kind: "ARM" },
        { t: 5, kind: "GUST_START" },
        { t: 7.4, kind: "GUST_END" },
        { t: 9, kind: "SATURATION" },
        { t: 10, kind: "FAILSAFE" },
      ],
      12,
    );

    expect(markers.points.map((event) => event.kind)).toEqual([
      "ARM",
      "GUST_START",
      "SATURATION",
      "FAILSAFE",
    ]);
    expect(markers.bands).toEqual([
      { kind: "GUST_START", start: 5, end: 7.4 },
      { kind: "SATURATION", start: 9, end: 12 },
    ]);
  });

  it("advances a replay at its rate and stops at the end", () => {
    expect(advancePlayback(1, 0.5, 0.5, span)).toEqual({ t: 1.25, ended: false });
    expect(advancePlayback(11.9, 1, 1, span)).toEqual({ t: 12, ended: true });
  });

  it("steps a tenth or a whole second and finds the latest event at the cursor", () => {
    expect(seekStep(5, 1, false, span)).toBeCloseTo(5.1);
    expect(seekStep(0.4, -1, true, span)).toBe(0);
    expect(
      latestEventIndex(
        [
          { t: 0, kind: "BOOT" },
          { t: 2, kind: "ARM" },
        ],
        1.5,
      ),
    ).toBe(0);
    expect(latestEventIndex([{ t: 3, kind: "ARM" }], 1)).toBe(-1);
  });
});

describe("mergeBands", () => {
  it("joins flickering saturation into one band with one marker and keeps far apart gusts", () => {
    const markers = timelineMarkers(
      [
        { t: 2, kind: "SATURATION" },
        { t: 2.2, kind: "SATURATION_END" },
        { t: 2.5, kind: "SATURATION" },
        { t: 2.6, kind: "SATURATION_END" },
        { t: 3, kind: "GUST_START" },
        { t: 3.5, kind: "GUST_END" },
        { t: 3.3, kind: "SATURATION" },
        { t: 6, kind: "GUST_START" },
      ],
      8,
    );

    expect(markers.bands).toEqual([
      { kind: "SATURATION", start: 2, end: 8 },
      { kind: "GUST_START", start: 3, end: 3.5 },
      { kind: "GUST_START", start: 6, end: 8 },
    ]);
    expect(markers.points.map((event) => `${event.kind}@${String(event.t)}`)).toEqual([
      "SATURATION@2",
      "GUST_START@3",
      "GUST_START@6",
    ]);
  });
});

describe("liveSpanEnd", () => {
  it("shows a short scenario whole and lets a long manual session grow with the flight", () => {
    expect(liveSpanEnd(3, 12)).toBe(12);
    expect(liveSpanEnd(10, 600)).toBe(30);
    expect(liveSpanEnd(100, 600)).toBe(120);
    expect(liveSpanEnd(600, 600)).toBe(600);
  });
});

describe("labelledMarkers", () => {
  it("names a marker only when it clears the label before it", () => {
    expect(labelledMarkers([0.5, 27.7, 28.5, 28.9, 40], { start: 0, end: 50 }, 1000)).toEqual([
      true,
      true,
      false,
      false,
      true,
    ]);
  });
});
