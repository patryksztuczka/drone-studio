import { describe, expect, it } from "vite-plus/test";

import { hotkeyAction } from "./hotkeys.ts";

const plain = { manualFlight: false, command: false };

describe("hotkeyAction", () => {
  it("plays and pauses with Space and resets with R in either case", () => {
    expect(hotkeyAction(" ", plain)).toBe("toggle-play");
    expect(hotkeyAction("R", plain)).toBe("reset");
  });

  it("leaves the arrow keys to the sticks while flying by hand", () => {
    expect(hotkeyAction("ArrowLeft", plain)).toBe("seek-back");
    expect(hotkeyAction("ArrowLeft", { manualFlight: true, command: false })).toBeUndefined();
    expect(hotkeyAction("x", { manualFlight: true, command: false })).toBe("xray");
  });

  it("switches modules with 1 to 4, with or without Command, and ignores other chords", () => {
    expect(hotkeyAction("1", plain)).toBe("module-workbench");
    expect(hotkeyAction("4", { manualFlight: false, command: true })).toBe("module-emulation");
    expect(hotkeyAction("r", { manualFlight: false, command: true })).toBeUndefined();
  });

  it("opens the charts with T and ignores keys it does not know", () => {
    expect(hotkeyAction("t", plain)).toBe("telemetry");
    expect(hotkeyAction("q", plain)).toBeUndefined();
  });
});
