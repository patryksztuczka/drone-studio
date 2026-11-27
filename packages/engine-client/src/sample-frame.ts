import { Option } from "effect";

export const LIVE_SAMPLE_KIND = 1;

const HEADER_BYTES = 8;

export interface SampleFrame {
  readonly sessionId: number;
  readonly values: Float32Array;
}

export const decodeSampleFrame = (bytes: Uint8Array): Option.Option<SampleFrame> => {
  if (bytes.byteLength < HEADER_BYTES || (bytes.byteLength - HEADER_BYTES) % 4 !== 0) {
    return Option.none();
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (view.getUint32(0, true) !== LIVE_SAMPLE_KIND) return Option.none();

  const count = (bytes.byteLength - HEADER_BYTES) / 4;
  const values = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    values[index] = view.getFloat32(HEADER_BYTES + index * 4, true);
  }

  return Option.some({ sessionId: view.getUint32(4, true), values });
};
