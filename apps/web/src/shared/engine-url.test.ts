import { describe, expect, it } from "vite-plus/test";

import { resolveEngineUrl } from "./engine-url.ts";

const fallback = "ws://127.0.0.1:47800";

describe("resolveEngineUrl", () => {
  it("takes the engine named in ?engine= first", () => {
    expect(resolveEngineUrl("?engine=ws://127.0.0.1:51234", "ws://127.0.0.1:1", fallback)).toBe(
      "ws://127.0.0.1:51234",
    );
  });

  it("uses the dev server's engine when the page names none", () => {
    expect(resolveEngineUrl("", "ws://127.0.0.1:26571", fallback)).toBe("ws://127.0.0.1:26571");
  });

  it("falls back to the default port when nothing valid is given", () => {
    expect(resolveEngineUrl("?engine=http://evil.example", "", fallback)).toBe(fallback);
    expect(resolveEngineUrl("?engine=nonsense", undefined, fallback)).toBe(fallback);
  });
});
