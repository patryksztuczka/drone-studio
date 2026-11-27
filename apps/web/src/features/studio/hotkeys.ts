import type { StudioModule } from "../../shared/studio.atoms.ts";

export type HotkeyAction =
  | "toggle-play"
  | "reset"
  | "xray"
  | "showcase"
  | "leave-showcase"
  | "camera"
  | "live"
  | "seek-back"
  | "seek-forward"
  | "telemetry"
  | `module-${StudioModule}`;

export interface HotkeyContext {
  readonly manualFlight: boolean;
  readonly command: boolean;
}

const MODULE_KEYS: ReadonlyMap<string, HotkeyAction> = new Map([
  ["1", "module-workbench"],
  ["2", "module-hardware"],
  ["3", "module-runs"],
  ["4", "module-emulation"],
]);

const ALWAYS: ReadonlyMap<string, HotkeyAction> = new Map([
  [" ", "toggle-play"],
  ["r", "reset"],
  ["x", "xray"],
  ["f", "showcase"],
  ["Escape", "leave-showcase"],
  ["c", "camera"],
  ["l", "live"],
  ["t", "telemetry"],
  ...MODULE_KEYS,
]);

const SEEKS: ReadonlyMap<string, HotkeyAction> = new Map([
  ["ArrowLeft", "seek-back"],
  ["ArrowRight", "seek-forward"],
]);

export const hotkeyAction = (key: string, context: HotkeyContext): HotkeyAction | undefined => {
  const normalised = key.length === 1 ? key.toLowerCase() : key;

  if (context.command) return MODULE_KEYS.get(normalised);

  return ALWAYS.get(normalised) ?? (context.manualFlight ? undefined : SEEKS.get(normalised));
};
