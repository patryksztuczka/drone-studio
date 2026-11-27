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
