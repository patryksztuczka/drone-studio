import { describe, expect, it } from "vite-plus/test";

import { hotkeyAction } from "./hotkeys.ts";

describe("hotkeyAction", () => {
  it("plays and pauses with Space and resets with R in either case", () => {
    expect(hotkeyAction(" ", { manualFlight: false })).toBe("toggle-play");
    expect(hotkeyAction("R", { manualFlight: false })).toBe("reset");
  });

  it("leaves the arrow keys to the sticks while flying by hand", () => {
    expect(hotkeyAction("ArrowLeft", { manualFlight: false })).toBe("seek-back");
    expect(hotkeyAction("ArrowLeft", { manualFlight: true })).toBeUndefined();
    expect(hotkeyAction("x", { manualFlight: true })).toBe("xray");
  });

  it("ignores keys it does not know", () => {
    expect(hotkeyAction("q", { manualFlight: false })).toBeUndefined();
  });
});
