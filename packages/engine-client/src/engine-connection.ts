import {
  Context,
  Deferred,
  Duration,
  Effect,
  Layer,
  Option,
  PubSub,
  Schedule,
  Schema,
  Stream,
  SubscriptionRef,
} from "effect";
import { Socket } from "effect/socket";

import {
  EngineOfflineError,
  EngineRefusedError,
  EngineReplyError,
  EngineTimeoutError,
} from "./engine.errors.ts";
import type { EngineCallError } from "./engine.errors.ts";
import { EngineError } from "./protocol.ts";
import { decodeSampleFrame } from "./sample-frame.ts";
import type { SampleFrame } from "./sample-frame.ts";

export const ConnectionState = Schema.TaggedUnion({
  Connecting: { url: Schema.String },
  Connected: { url: Schema.String },
  Offline: { url: Schema.String, reason: Schema.String },
});

export type ConnectionState = typeof ConnectionState.Type;

type ParamValue = string | number | boolean | null | Readonly<Record<string, number>>;

export type RequestParams = Readonly<Record<string, ParamValue>>;

export interface EngineNotification {
  readonly method: string;
  readonly params: Schema.Json;
}

export interface EngineConnectionApi {
  readonly url: string;
  readonly state: SubscriptionRef.SubscriptionRef<ConnectionState>;
  readonly call: <A>(
    method: string,
    params: RequestParams,
    reply: Schema.Decoder<A>,
  ) => Effect.Effect<A, EngineCallError>;
  readonly notifications: Stream.Stream<EngineNotification>;
  readonly samples: Stream.Stream<SampleFrame>;
}

export interface EngineEndpointApi {
  readonly url: string;
  readonly callTimeout: Duration.Input;
  readonly reconnectEvery: Duration.Input;
}

export class EngineEndpoint extends Context.Service<EngineEndpoint, EngineEndpointApi>()(
  "drone-studio/engine-client/EngineEndpoint",
) {
  static readonly layer = (endpoint: EngineEndpointApi) => Layer.succeed(EngineEndpoint, endpoint);
}

const RequestId = Schema.Number.pipe(Schema.brand("RequestId"));

const Envelope = Schema.Struct({
  id: Schema.optional(RequestId),
  method: Schema.optional(Schema.String),
  params: Schema.optional(Schema.Json),
  result: Schema.optional(Schema.Json),
  error: Schema.optional(EngineError),
});

const decodeEnvelope = Schema.decodeUnknownOption(Schema.fromJsonString(Envelope));

const reasonOf = (error: Socket.SocketError) => error.message;

export class EngineConnection extends Context.Service<EngineConnection, EngineConnectionApi>()(
  "drone-studio/engine-client/EngineConnection",
  {
    make: Effect.gen(function* () {
      const endpoint = yield* EngineEndpoint;
      const socket = yield* Socket.makeWebSocket(endpoint.url, { openTimeout: "3 seconds" });

      const state = yield* SubscriptionRef.make<ConnectionState>(
        ConnectionState.cases.Connecting.make({ url: endpoint.url }),
      );

      const notifications = yield* PubSub.unbounded<EngineNotification>();
      const samples = yield* PubSub.sliding<SampleFrame>(240);
      const pending = new Map<number, Deferred.Deferred<Schema.Json, EngineRefusedError>>();
      let nextId = 0;
      let connected = false;

      const settle = (id: number, outcome: Effect.Effect<Schema.Json, EngineRefusedError>) => {
        const waiting = pending.get(id);

        if (waiting === undefined) return;

        pending.delete(id);
        Deferred.doneUnsafe(waiting, outcome);
      };

      const dispatchText = (text: string) =>
        Option.match(decodeEnvelope(text), {
          onNone: () => Effect.void,
          onSome: (envelope) => {
            if (envelope.id !== undefined) {
              const id = envelope.id;

              return Effect.sync(() =>
                settle(
                  id,
                  envelope.error === undefined
                    ? Effect.succeed(envelope.result ?? null)
                    : Effect.fail(
                        new EngineRefusedError({
                          method: "request",
                          reason: envelope.error.message,
                        }),
                      ),
                ),
              );
            }

            if (envelope.method === undefined) return Effect.void;

            return PubSub.publish(notifications, {
              method: envelope.method,
              params: envelope.params ?? null,
            });
          },
        });

      const dispatch = (chunk: Uint8Array | string) => {
        if (Schema.is(Schema.String)(chunk)) return dispatchText(chunk);

        return Option.match(decodeSampleFrame(chunk), {
          onNone: () => Effect.void,
          onSome: (frame) => PubSub.publish(samples, frame),
        });
      };

      const forgetPending = Effect.sync(() => {
        connected = false;

        for (const id of [...pending.keys()]) {
          settle(
            id,
            Effect.fail(new EngineRefusedError({ method: "request", reason: "disconnected" })),
          );
        }
      });

      const session = Effect.gen(function* () {
        const reader = yield* socket.reader;

        connected = true;
        yield* SubscriptionRef.set(
          state,
          ConnectionState.cases.Connected.make({ url: endpoint.url }),
        );

        return yield* reader.pull.pipe(
          Effect.flatMap((chunks) => Effect.forEach(chunks, dispatch, { discard: true })),
          Effect.forever,
        );
      }).pipe(
        Effect.scoped,
        Effect.ensuring(forgetPending),
        Effect.tapError((error) =>
          SubscriptionRef.set(
            state,
            ConnectionState.cases.Offline.make({ url: endpoint.url, reason: reasonOf(error) }),
          ),
        ),
      );

      yield* session.pipe(
        Effect.retry({
          schedule: Schedule.spaced(endpoint.reconnectEvery),
          while: Socket.isSocketError,
        }),
        Effect.forkScoped,
      );

      const writer = yield* socket.writer;

      const call = <A>(method: string, params: RequestParams, reply: Schema.Decoder<A>) =>
        Effect.gen(function* () {
          if (!connected) return yield* new EngineOfflineError({ method, url: endpoint.url });

          nextId += 1;

          const id = nextId;
          const answer = yield* Deferred.make<Schema.Json, EngineRefusedError>();

          pending.set(id, answer);

          yield* writer
            .write(JSON.stringify({ jsonrpc: "2.0", id, method, params }))
            .pipe(Effect.mapError(() => new EngineOfflineError({ method, url: endpoint.url })));

          const raw = yield* Deferred.await(answer).pipe(
            Effect.mapError((error) => new EngineRefusedError({ method, reason: error.reason })),
            Effect.timeoutOrElse({
              duration: endpoint.callTimeout,
              orElse: () => Effect.fail(new EngineTimeoutError({ method })),
            }),
            Effect.ensuring(Effect.sync(() => pending.delete(id))),
          );

          return yield* Schema.decodeUnknownEffect(reply)(raw).pipe(
            Effect.mapError((error) => new EngineReplyError({ method, reason: error.message })),
          );
        });

      return {
        url: endpoint.url,
        state,
        call,
        notifications: Stream.fromPubSub(notifications),
        samples: Stream.fromPubSub(samples),
      };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);

  static readonly layerAt = (url: string) =>
    EngineConnection.layer.pipe(
      Layer.provide(
        EngineEndpoint.layer({ url, callTimeout: "20 seconds", reconnectEvery: "1 second" }),
      ),
      Layer.provide(Socket.layerWebSocketConstructorGlobal),
    );
}
