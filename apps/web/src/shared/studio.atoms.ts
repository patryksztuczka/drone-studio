import {
  connectionState,
  ConnectionState,
  engineInfo,
  liveRecording,
  loadedRun,
  RunId,
} from "@drone-studio/engine-client";
import type {
  AirframeId,
  Anomaly,
  FlightEvent,
  LiveRecording,
  LoadedRun,
  SampleTable,
  ScenarioId,
  SessionStatus,
} from "@drone-studio/engine-client";
import { Option, Schema } from "effect";
import { AsyncResult, Atom } from "effect/reactivity";

export const PlaybackSource = Schema.TaggedUnion({
  Live: {},
  Run: { runId: RunId },
});

export type PlaybackSource = typeof PlaybackSource.Type;

export const playbackSource = Atom.make<PlaybackSource>(PlaybackSource.cases.Live.make({})).pipe(
  Atom.keepAlive,
);

export const cursor = Atom.make(0).pipe(Atom.keepAlive);

export const followLive = Atom.make(true).pipe(Atom.keepAlive);

export const replayPlaying = Atom.make(false).pipe(Atom.keepAlive);

export const replayRate = Atom.make(1).pipe(Atom.keepAlive);

export const ghostRun = Atom.make<Option.Option<RunId>>(Option.none()).pipe(Atom.keepAlive);

export type ViewMode = "studio" | "xray";

export const viewMode = Atom.make<ViewMode>("studio").pipe(Atom.keepAlive);

export type CameraMode = "follow" | "orbit";

export const cameraMode = Atom.make<CameraMode>("follow").pipe(Atom.keepAlive);

export const showcase = Atom.make(false).pipe(Atom.keepAlive);

export type InspectorTab = "hardware" | "telemetry" | "runs";

export const inspectorTab = Atom.make<InspectorTab>("telemetry").pipe(Atom.keepAlive);

export const runsSeenAt = Atom.make("").pipe(Atom.keepAlive);

export type StudioMode = "SIM" | "EMU" | "REAL";

export const studioMode = Atom.make<StudioMode>("SIM").pipe(Atom.keepAlive);

export const MANUAL_SCENARIO = "manual";

export const selectedScenario = Atom.make<ScenarioId | typeof MANUAL_SCENARIO | undefined>(
  undefined,
).pipe(Atom.keepAlive);

export const selectedAirframe = Atom.make<AirframeId | undefined>(undefined).pipe(Atom.keepAlive);

export const viewportFrames = Atom.make(0).pipe(Atom.keepAlive);

export interface FlightView {
  readonly key: string;
  readonly live: boolean;
  readonly label: string;
  readonly result: string | undefined;
  readonly table: SampleTable;
  readonly events: ReadonlyArray<FlightEvent>;
  readonly anomalies: ReadonlyArray<Anomaly>;
  readonly revision: number;
  readonly status: SessionStatus | undefined;
}

const liveView = (recording: LiveRecording, name: (id: string) => string): FlightView => ({
  key: `live:${String(recording.sessionId)}`,
  live: true,
  label: recording.status === undefined ? "live session" : name(recording.status.scenario),
  result: recording.stopped?.result ?? undefined,
  table: recording.table,
  events: recording.events,
  anomalies: [],
  revision: recording.frames,
  status: recording.status,
});

const runView = (run: LoadedRun): FlightView => ({
  key: `run:${run.runId}`,
  live: false,
  label: run.scenarioName,
  result: run.result,
  table: run.table,
  events: run.events,
  anomalies: run.anomalies,
  revision: run.table.length,
  status: undefined,
});

const loadedView = (result: AsyncResult.AsyncResult<LoadedRun, unknown>) =>
  AsyncResult.isSuccess(result) ? Option.some(runView(result.value)) : Option.none();

export const activeFlight = Atom.make((get): Option.Option<FlightView> =>
  PlaybackSource.match(get(playbackSource), {
    Live: () =>
      Option.map(get(liveRecording), (recording) =>
        liveView(recording, (id) => {
          const info = get(engineInfo);

          const known = AsyncResult.isSuccess(info)
            ? info.value.scenarios.find((scenario) => scenario.id === id)
            : undefined;

          return known?.name ?? (id === "manual_flight" ? "Manual flight" : id);
        }),
      ),
    Run: (source) => loadedView(get(loadedRun(source.runId))),
  }),
).pipe(Atom.keepAlive);

export const activeRunLoading = Atom.make((get) =>
  PlaybackSource.match(get(playbackSource), {
    Live: () => false,
    Run: (source) => AsyncResult.isWaiting(get(loadedRun(source.runId))),
  }),
);

export const ghostFlight = Atom.make((get): Option.Option<FlightView> =>
  Option.flatMap(get(ghostRun), (runId) => loadedView(get(loadedRun(runId)))),
).pipe(Atom.keepAlive);

export const playhead = Atom.make((get) => {
  const flight = get(activeFlight);
  const following = get(followLive);

  return Option.match(flight, {
    onNone: () => get(cursor),
    onSome: (view) =>
      view.live && following
        ? view.table.endTime
        : Math.min(Math.max(get(cursor), view.table.startTime), view.table.endTime),
  });
}).pipe(Atom.keepAlive);

export const liveSession = Atom.make((get) =>
  Option.flatMap(get(liveRecording), (recording) => Option.fromUndefinedOr(recording.status)),
).pipe(Atom.keepAlive);

export const engineConnected = Atom.make((get) => {
  const state = get(connectionState);

  return AsyncResult.isSuccess(state) && ConnectionState.guards.Connected(state.value);
}).pipe(Atom.keepAlive);

export const scenarios = Atom.make((get) => {
  const info = get(engineInfo);

  return AsyncResult.isSuccess(info) ? info.value.scenarios : [];
}).pipe(Atom.keepAlive);

export const airframes = Atom.make((get) => {
  const info = get(engineInfo);

  return AsyncResult.isSuccess(info) ? info.value.airframes : [];
}).pipe(Atom.keepAlive);

export const currentAirframe = Atom.make((get) => {
  const chosen = get(selectedAirframe);

  return chosen ?? get(airframes)[0];
}).pipe(Atom.keepAlive);

export const manualFlightActive = Atom.make((get) =>
  Option.match(get(liveSession), {
    onNone: () => false,
    onSome: (status) => status.mode === "manual" && !status.finished,
  }),
).pipe(Atom.keepAlive);
