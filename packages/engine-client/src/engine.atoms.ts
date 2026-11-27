import { Effect, Layer, Option, Schema, Stream } from "effect";
import { AsyncResult, Atom } from "effect/reactivity";
import type { AtomContext } from "effect/reactivity/Atom";

import { ConnectionState, EngineConnection } from "./engine-connection.ts";
import type { EngineNotification, RequestParams } from "./engine-connection.ts";
import {
  emptyRecording,
  withEvents,
  withSample,
  withSpectrum,
  withStatus,
  withStopped,
} from "./live-recording.ts";
import type { LiveRecording } from "./live-recording.ts";
import {
  BoardLayout,
  EmuStatus,
  EngineInfo,
  FocusRequest,
  HardwareCatalog,
  HardwarePreview,
  LiveSpectrum,
  LoadedRunPayload,
  RealStatus,
  RunList,
  SessionEvents,
  SessionStatus,
  SessionStopped,
  SmokeReport,
  SmokeStarted,
  Spectrum,
  Sticks,
} from "./protocol.ts";
import type {
  AirframeId,
  Anomaly,
  FlightEvent,
  PartSelection,
  RunId,
  RunSummary,
  ScenarioId,
  SessionMode,
  SticksMode,
} from "./protocol.ts";
import { SampleTable } from "./sample-table.ts";

export const DEFAULT_ENGINE_URL = "ws://127.0.0.1:47800";

export const engineLayer = Atom.make<Layer.Layer<EngineConnection>>(
  EngineConnection.layerAt(DEFAULT_ENGINE_URL),
).pipe(Atom.keepAlive);

const engineRuntime = Atom.runtime((get) => get(engineLayer)).pipe(Atom.keepAlive);

export const connectionState = engineRuntime
  .subscriptionRef(EngineConnection.useSync((connection) => connection.state))
  .pipe(Atom.keepAlive);

const isConnected = (get: AtomContext) => {
  const state = get(connectionState);

  return AsyncResult.isSuccess(state) && ConnectionState.guards.Connected(state.value);
};

const connected = (get: AtomContext) => (isConnected(get) ? EngineConnection : Effect.never);

export const engineInfo = engineRuntime
  .atom((get) =>
    Effect.flatMap(connected(get), (connection) => connection.call("engine.info", {}, EngineInfo)),
  )
  .pipe(Atom.keepAlive);

export const runsRevision = Atom.make(0).pipe(Atom.keepAlive);

export const runs = engineRuntime
  .atom((get) => {
    get(runsRevision);

    return Effect.flatMap(connected(get), (connection) =>
      Effect.map(connection.call("runs.list", { limit: 60 }, RunList), (list) => list.runs),
    );
  })
  .pipe(Atom.keepAlive);

export type RunsList = ReadonlyArray<RunSummary>;

export interface LoadedRun {
  readonly runId: RunId;
  readonly result: LoadedRunPayload["meta"]["result"];
  readonly scenarioName: string;
  readonly source: string;
  readonly table: SampleTable;
  readonly events: ReadonlyArray<FlightEvent>;
  readonly anomalies: ReadonlyArray<Anomaly>;
}

const toLoadedRun = (payload: LoadedRunPayload): LoadedRun => ({
  runId: payload.meta.run_id,
  result: payload.meta.result,
  scenarioName: payload.meta.scenario.name,
  source: payload.meta.source,
  table: SampleTable.fromColumns(payload.t, payload.columns),
  events: payload.events,
  anomalies: payload.anomalies,
});

export const loadedRun = Atom.family((runId: RunId) =>
  engineRuntime.atom((get) =>
    Effect.flatMap(connected(get), (connection) =>
      Effect.map(
        connection.call("runs.load", { run_id: runId, rate_hz: 100 }, LoadedRunPayload),
        toLoadedRun,
      ),
    ),
  ),
);

const SPECTRUM_STEP_S = 0.5;

const runSpectrumFamily = Atom.family((key: string) => {
  const [runId = "", bucket = "0"] = key.split("@");

  return engineRuntime.atom((get) =>
    Effect.flatMap(connected(get), (connection) =>
      connection.call("runs.spectrum", { run_id: runId, t: Number(bucket) }, Spectrum),
    ),
  );
});

export const runSpectrum = (runId: RunId, t: number) =>
  runSpectrumFamily(
    `${runId}@${String(Math.max(2, Math.round(t / SPECTRUM_STEP_S) * SPECTRUM_STEP_S))}`,
  );

export const boardLayout = Atom.family((airframe: AirframeId) =>
  engineRuntime
    .atom((get) =>
      Effect.flatMap(connected(get), (connection) =>
        connection.call("hardware.layout", { airframe }, BoardLayout),
      ),
    )
    .pipe(Atom.keepAlive),
);

export const hardwareCatalog = engineRuntime
  .atom((get) =>
    Effect.flatMap(connected(get), (connection) =>
      connection.call("hardware.catalog", {}, HardwareCatalog),
    ),
  )
  .pipe(Atom.keepAlive);

export interface PreviewRequest {
  readonly airframe: AirframeId;
  readonly selection: PartSelection;
}

export const hardwarePreview = engineRuntime
  .fn((request: PreviewRequest) =>
    Effect.flatMap(EngineConnection, (connection) =>
      connection.call(
        "hardware.preview",
        { airframe: request.airframe, ...request.selection },
        HardwarePreview,
      ),
    ),
  )
  .pipe(Atom.keepAlive);

export const emuRevision = Atom.make(0).pipe(Atom.keepAlive);

export const emuStatus = engineRuntime.atom((get) => {
  get(emuRevision);

  return Effect.flatMap(connected(get), (connection) =>
    connection.call("emu.status", {}, EmuStatus),
  );
});

export const SmokeRun = Schema.TaggedUnion({
  Running: {},
  Finished: { report: SmokeReport },
});

export type SmokeRun = typeof SmokeRun.Type;

export const smokeRun = Atom.make<Option.Option<SmokeRun>>(Option.none()).pipe(Atom.keepAlive);

export const runSmoke = engineRuntime
  .fn(() =>
    Effect.flatMap(EngineConnection, (connection) =>
      connection.call("emu.smoke", {}, SmokeStarted),
    ),
  )
  .pipe(Atom.keepAlive);

export const realStatus = engineRuntime.atom((get) =>
  Effect.flatMap(connected(get), (connection) => connection.call("real.status", {}, RealStatus)),
);

export interface FocusTarget {
  readonly runId: RunId;
  readonly t: number;
  readonly sequence: number;
}

export const focusTarget = Atom.make<Option.Option<FocusTarget>>(Option.none()).pipe(
  Atom.keepAlive,
);

export const liveRecording = Atom.make<Option.Option<LiveRecording>>(Option.none()).pipe(
  Atom.keepAlive,
);

const decodeSessionStatus = Schema.decodeUnknownOption(SessionStatus);

const decodeSessionEvents = Schema.decodeUnknownOption(SessionEvents);

const decodeSessionStopped = Schema.decodeUnknownOption(SessionStopped);

const decodeLiveSpectrum = Schema.decodeUnknownOption(LiveSpectrum);

const decodeFocus = Schema.decodeUnknownOption(FocusRequest);

const decodeSmokeReport = Schema.decodeUnknownOption(SmokeReport);

const SessionOfStopped = Schema.Struct({ session_id: Schema.Number });

const decodeStoppedSession = Schema.decodeUnknownOption(SessionOfStopped);

const updateRecording = (
  get: AtomContext,
  columns: ReadonlyArray<string>,
  sessionId: number,
  update: (recording: LiveRecording) => LiveRecording,
) => {
  const current = Option.getOrElse(get.once(liveRecording), () =>
    emptyRecording(columns, sessionId),
  );

  get.set(liveRecording, Option.some(update(current)));
};

const applyNotification = (
  get: AtomContext,
  columns: ReadonlyArray<string>,
  notification: EngineNotification,
) => {
  const { method, params } = notification;

  if (method === "sim.started" || method === "sim.status") {
    Option.map(decodeSessionStatus(params), (status) =>
      updateRecording(get, columns, status.session_id, (recording) =>
        withStatus(recording, columns, status),
      ),
    );
  } else if (method === "sim.events") {
    Option.map(decodeSessionEvents(params), (batch) =>
      updateRecording(get, columns, batch.session_id, (recording) =>
        withEvents(recording, columns, batch.session_id, batch.events),
      ),
    );
  } else if (method === "sim.finished") {
    Option.map(decodeSessionStopped(params), (stopped) => {
      const session = Option.getOrElse(
        Option.map(decodeStoppedSession(params), (owner) => owner.session_id),
        () => -1,
      );

      updateRecording(get, columns, session, (recording) => withStopped(recording, stopped));
    });
  } else if (method === "telemetry.spectrum") {
    Option.map(decodeLiveSpectrum(params), (spectrum) =>
      updateRecording(get, columns, spectrum.session_id, (recording) =>
        withSpectrum(recording, spectrum.session_id, spectrum),
      ),
    );
  } else if (method === "runs.changed") {
    get.set(runsRevision, get.once(runsRevision) + 1);
  } else if (method === "emu.smoke.started") {
    get.set(smokeRun, Option.some(SmokeRun.cases.Running.make({})));
  } else if (method === "emu.smoke.finished") {
    const report = Option.getOrElse(decodeSmokeReport(params), () => ({
      ok: false,
      error: "drone-engine sent a smoke report Studio cannot read",
    }));

    get.set(smokeRun, Option.some(SmokeRun.cases.Finished.make({ report })));
    get.set(emuRevision, get.once(emuRevision) + 1);
  } else if (method === "studio.focus") {
    Option.map(decodeFocus(params), (focus) => {
      const previous = Option.match(get.once(focusTarget), {
        onNone: () => 0,
        onSome: (target) => target.sequence,
      });

      get.set(
        focusTarget,
        Option.some({ runId: focus.run_id, t: focus.t ?? 0, sequence: previous + 1 }),
      );
    });
  }
};

export const engineFeed = engineRuntime
  .atom((get) =>
    Effect.gen(function* () {
      const connection = yield* connected(get);
      const info = yield* get.result(engineInfo);
      const columns = info.frame.columns;

      if (info.live !== null) {
        const live = info.live;

        updateRecording(get, columns, live.session_id, (recording) =>
          withStatus(recording, columns, live),
        );
      }

      yield* Stream.runForEach(connection.notifications, (notification) =>
        Effect.sync(() => applyNotification(get, columns, notification)),
      ).pipe(Effect.forkScoped);

      yield* Stream.runForEach(connection.samples, (frame) =>
        Effect.sync(() =>
          updateRecording(get, columns, frame.sessionId, (recording) =>
            withSample(recording, columns, frame),
          ),
        ),
      ).pipe(Effect.forkScoped);

      return yield* Effect.never;
    }),
  )
  .pipe(Atom.keepAlive);

export interface StartSession {
  readonly mode: SessionMode;
  readonly scenario: ScenarioId | undefined;
  readonly speed: number;
}

const command = <A>(method: string, params: RequestParams, reply: Schema.Decoder<A>) =>
  Effect.flatMap(EngineConnection, (connection) => connection.call(method, params, reply));

export const startSession = engineRuntime
  .fn((start: StartSession) =>
    command(
      "sim.start",
      start.scenario === undefined
        ? { mode: start.mode, speed: start.speed }
        : { mode: start.mode, scenario: start.scenario, speed: start.speed },
      SessionStatus,
    ),
  )
  .pipe(Atom.keepAlive);

export const pauseSession = engineRuntime
  .fn((paused: boolean) => command("sim.pause", { paused }, SessionStatus))
  .pipe(Atom.keepAlive);

export const sessionSpeed = engineRuntime
  .fn((speed: number) => command("sim.speed", { speed }, SessionStatus))
  .pipe(Atom.keepAlive);

export const resetSession = engineRuntime
  .fn(() => command("sim.reset", {}, SessionStatus))
  .pipe(Atom.keepAlive);

export const stopSession = engineRuntime
  .fn((record: boolean) => command("sim.stop", { record }, SessionStopped))
  .pipe(Atom.keepAlive);

export interface StickCommand {
  readonly roll: number;
  readonly pitch: number;
  readonly yaw: number;
  readonly throttle: number;
  readonly arm: boolean;
  readonly mode: SticksMode;
}

export const sendSticks = engineRuntime
  .fn(
    (sticks: StickCommand) =>
      command(
        "rc.set",
        {
          roll: sticks.roll,
          pitch: sticks.pitch,
          yaw: sticks.yaw,
          throttle: sticks.throttle,
          arm: sticks.arm,
          mode: sticks.mode,
        },
        Schema.NullOr(Sticks),
      ),
    { concurrent: true },
  )
  .pipe(Atom.keepAlive);
