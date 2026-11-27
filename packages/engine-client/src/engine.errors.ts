import { Schema } from "effect";

export class EngineOfflineError extends Schema.TaggedError<
  EngineOfflineError,
  { readonly brand: unique symbol }
>()("EngineOfflineError", { method: Schema.String, url: Schema.String }) {
  override get message() {
    return `drone-engine is not connected at ${this.url}, so ${this.method} was not sent. Start it with pnpm dev, or open Studio with ?engine=<url>.`;
  }
}

export class EngineRefusedError extends Schema.TaggedError<
  EngineRefusedError,
  { readonly brand: unique symbol }
>()("EngineRefusedError", { method: Schema.String, reason: Schema.String }) {
  override get message() {
    return `drone-engine refused ${this.method}: ${this.reason}`;
  }
}

export class EngineTimeoutError extends Schema.TaggedError<
  EngineTimeoutError,
  { readonly brand: unique symbol }
>()("EngineTimeoutError", { method: Schema.String }) {
  override get message() {
    return `drone-engine did not answer ${this.method} in time.`;
  }
}

export class EngineReplyError extends Schema.TaggedError<
  EngineReplyError,
  { readonly brand: unique symbol }
>()("EngineReplyError", { method: Schema.String, reason: Schema.String }) {
  override get message() {
    return `drone-engine answered ${this.method} with a reply Studio does not understand: ${this.reason}`;
  }
}

export type EngineCallError =
  | EngineOfflineError
  | EngineRefusedError
  | EngineTimeoutError
  | EngineReplyError;
