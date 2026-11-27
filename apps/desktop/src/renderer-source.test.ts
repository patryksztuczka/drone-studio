import { describe, expect, it } from "@effect/vitest";

import {
  appUrl,
  BUNDLE_ORIGIN,
  RendererSource,
  Resolution,
  resolveBundleRequest,
} from "./renderer-source.ts";

const bundle = RendererSource.cases.Bundle.make({
  directory: "/app/web/dist",
  origin: BUNDLE_ORIGIN,
});

const resolve = (url: string) => resolveBundleRequest(bundle, new URL(url));

const file = (relativePath: string) =>
  Resolution.cases.File.make({ directory: "/app/web/dist", relativePath });

describe("appUrl", () => {
  it("opens the dev server as it is", () => {
    const devServer = RendererSource.cases.DevServer.make({
      url: new URL("http://localhost:5173"),
    });

    expect(appUrl(devServer).href).toBe("http://localhost:5173/");
  });

  it("opens the root of the app's origin for the bundle", () => {
    expect(appUrl(bundle).href).toBe("https://studio.invalid/");
  });
});

describe("resolveBundleRequest", () => {
  it("serves /api from the bundle like any other route, since there is no api", () => {
    expect(resolve("https://studio.invalid/api/engine")).toEqual(file("index.html"));
  });

  it("sends another host or scheme to the network", () => {
    for (const url of ["https://fonts.example.com/a.woff2", "http://app.example.com/assets/a.js"]) {
      expect(resolve(url)).toEqual(Resolution.cases.Network.make({}));
    }
  });

  it("serves an asset by its decoded path", () => {
    expect(resolve("https://studio.invalid/assets/index%20a.js")).toEqual(
      file("assets/index a.js"),
    );
  });

  it("falls back to index.html for the root and for a route without an extension", () => {
    for (const url of [
      "https://studio.invalid/",
      "https://studio.invalid/telemetry/42",
      "https://studio.invalid/simulation?run=1",
    ]) {
      expect(resolve(url)).toEqual(file("index.html"));
    }
  });

  it("refuses an encoded climb out of the bundle", () => {
    for (const url of [
      "https://studio.invalid/assets/..%2F..%2Fsecret.txt",
      "https://studio.invalid/%2e%2e%5csecret.txt",
      "https://studio.invalid/assets/%00.js",
    ]) {
      expect(resolve(url)).toEqual(Resolution.cases.NotFound.make({}));
    }
  });

  it("refuses a malformed percent sequence", () => {
    expect(resolve("https://studio.invalid/assets/%E0%A4%A.js")).toEqual(
      Resolution.cases.NotFound.make({}),
    );
  });
});
