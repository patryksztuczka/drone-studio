import { describe, expect, it } from "@effect/vitest";

import { emptyRecording, withEvents, withSample, withStatus } from "./live-recording.ts";
import type { SessionStatus } from "./protocol.ts";

const columns = ["t", "height"];

const status = (sessionId: number): SessionStatus => ({
  session_id: sessionId,
  mode: "manual",
  scenario: "manual_flight",
  t: 0,
  duration_s: 600,
  speed: 1,
  paused: false,
  finished: false,
  rc: { roll: 0, pitch: 0, yaw: 0, throttle: 0.5, arm: false, mode: "althold" },
});

describe("live recording", () => {
  it("accumulates the frames of one session so they can be scrubbed", () => {
    let recording = emptyRecording(columns, 1);

    for (const t of [0, 1 / 60, 2 / 60]) {
      recording = withSample(recording, columns, {
        sessionId: 1,
        values: Float32Array.of(t, t * 2),
      });
    }

    expect(recording.frames).toBe(3);
    expect(recording.table.length).toBe(3);
  });

  it("starts an empty recording when the session id changes", () => {
    const first = withEvents(emptyRecording(columns, 1), columns, 1, [{ t: 0.5, kind: "ARM" }]);
    const second = withSample(first, columns, { sessionId: 2, values: Float32Array.of(0, 0) });

    expect(second.sessionId).toBe(2);
    expect(second.events).toEqual([]);
    expect(second.table.length).toBe(1);
  });

  it("drops a frame older than the last one it kept", () => {
    const recording = withSample(emptyRecording(columns, 1), columns, {
      sessionId: 1,
      values: Float32Array.of(1, 0),
    });

    expect(
      withSample(recording, columns, { sessionId: 1, values: Float32Array.of(0.5, 0) }).table
        .length,
    ).toBe(1);
  });

  it("keeps the frames when the status of the same session arrives", () => {
    const recording = withSample(emptyRecording(columns, 4), columns, {
      sessionId: 4,
      values: Float32Array.of(0, 0),
    });

    expect(withStatus(recording, columns, status(4)).table.length).toBe(1);
    expect(withStatus(recording, columns, status(5)).table.length).toBe(0);
  });
});
