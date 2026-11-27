import type { FlightEvent, SessionStatus, SessionStopped, Spectrum } from "./protocol.ts";
import type { SampleFrame } from "./sample-frame.ts";
import { SampleTable } from "./sample-table.ts";

export interface LiveRecording {
  readonly sessionId: number;
  readonly table: SampleTable;
  readonly events: ReadonlyArray<FlightEvent>;
  readonly spectrum: Spectrum | undefined;
  readonly status: SessionStatus | undefined;
  readonly stopped: SessionStopped | undefined;
  readonly frames: number;
}

export const emptyRecording = (
  columns: ReadonlyArray<string>,
  sessionId: number,
): LiveRecording => ({
  sessionId,
  table: new SampleTable(columns),
  events: [],
  spectrum: undefined,
  status: undefined,
  stopped: undefined,
  frames: 0,
});

const forSession = (
  recording: LiveRecording,
  columns: ReadonlyArray<string>,
  sessionId: number,
): LiveRecording =>
  recording.sessionId === sessionId && recording.table.columns.length === columns.length
    ? recording
    : emptyRecording(columns, sessionId);

export const withSample = (
  recording: LiveRecording,
  columns: ReadonlyArray<string>,
  frame: SampleFrame,
): LiveRecording => {
  const current = forSession(recording, columns, frame.sessionId);
  const last = current.table.length === 0 ? Number.NEGATIVE_INFINITY : current.table.endTime;

  if ((frame.values[0] ?? 0) < last) return current;

  current.table.append(frame.values);

  return { ...current, frames: current.frames + 1 };
};

export const withStatus = (
  recording: LiveRecording,
  columns: ReadonlyArray<string>,
  status: SessionStatus,
): LiveRecording => ({ ...forSession(recording, columns, status.session_id), status });

export const withEvents = (
  recording: LiveRecording,
  columns: ReadonlyArray<string>,
  sessionId: number,
  events: ReadonlyArray<FlightEvent>,
): LiveRecording => {
  const current = forSession(recording, columns, sessionId);

  return { ...current, events: [...current.events, ...events] };
};

export const withSpectrum = (
  recording: LiveRecording,
  sessionId: number,
  spectrum: Spectrum,
): LiveRecording => (recording.sessionId === sessionId ? { ...recording, spectrum } : recording);

export const withStopped = (recording: LiveRecording, stopped: SessionStopped): LiveRecording => ({
  ...recording,
  stopped,
  status: recording.status === undefined ? undefined : { ...recording.status, finished: true },
});
