import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";

import { decodeSampleFrame } from "./sample-frame.ts";

const frame = (kind: number, session: number, values: ReadonlyArray<number>) => {
  const buffer = new ArrayBuffer(8 + values.length * 4);
  const view = new DataView(buffer);

  view.setUint32(0, kind, true);
  view.setUint32(4, session, true);
  values.forEach((value, index) => view.setFloat32(8 + index * 4, value, true));

  return new Uint8Array(buffer);
};

describe("decodeSampleFrame", () => {
  it("reads the session id and the little-endian f32 values after the header", () => {
    const decoded = Option.getOrThrow(decodeSampleFrame(frame(1, 7, [2.5, -1, 0.125])));

    expect(decoded.sessionId).toBe(7);
    expect([...decoded.values]).toEqual([2.5, -1, 0.125]);
  });

  it("reads a frame that sits at an offset inside a larger buffer", () => {
    const bytes = frame(1, 3, [4]);
    const padded = new Uint8Array(bytes.length + 4);

    padded.set(bytes, 4);

    const decoded = Option.getOrThrow(decodeSampleFrame(padded.subarray(4)));

    expect(decoded.sessionId).toBe(3);
    expect([...decoded.values]).toEqual([4]);
  });

  it("ignores another frame kind, a short header and a ragged payload", () => {
    expect(decodeSampleFrame(frame(2, 1, [1]))).toEqual(Option.none());
    expect(decodeSampleFrame(new Uint8Array(6))).toEqual(Option.none());
    expect(decodeSampleFrame(new Uint8Array(11))).toEqual(Option.none());
  });
});
