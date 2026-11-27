import { Schema } from "effect";

export class RendererLoadError extends Schema.TaggedError<
  RendererLoadError,
  { readonly brand: unique symbol }
>()("RendererLoadError", { url: Schema.String, reason: Schema.String }) {
  override get message() {
    return `The window could not load ${this.url}: ${this.reason}. In development, start the window with pnpm dev:desktop.`;
  }
}

export class BundleReadError extends Schema.TaggedError<
  BundleReadError,
  { readonly brand: unique symbol }
>()("BundleReadError", { file: Schema.String, reason: Schema.String }) {}

export class EngineStartError extends Schema.TaggedError<
  EngineStartError,
  { readonly brand: unique symbol }
>()("EngineStartError", { reason: Schema.String }) {
  override get message() {
    return `drone-engine did not start: ${this.reason}. Build it with cargo build --release -p drone-engine, or set DESKTOP_ENGINE_URL to a running engine.`;
  }
}

export class SmokeError extends Schema.TaggedError<SmokeError, { readonly brand: unique symbol }>()(
  "SmokeError",
  { reason: Schema.String },
) {
  override get message() {
    return `The desktop smoke run failed: ${this.reason}.`;
  }
}
