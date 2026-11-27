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
  | "tab-hardware"
  | "tab-telemetry"
  | "tab-runs";

export interface HotkeyContext {
  readonly manualFlight: boolean;
}

const ALWAYS: ReadonlyMap<string, HotkeyAction> = new Map([
  [" ", "toggle-play"],
  ["r", "reset"],
  ["x", "xray"],
  ["f", "showcase"],
  ["Escape", "leave-showcase"],
  ["c", "camera"],
  ["l", "live"],
  ["1", "tab-hardware"],
  ["2", "tab-telemetry"],
  ["3", "tab-runs"],
]);

const SEEKS: ReadonlyMap<string, HotkeyAction> = new Map([
  ["ArrowLeft", "seek-back"],
  ["ArrowRight", "seek-forward"],
]);

export const hotkeyAction = (key: string, context: HotkeyContext): HotkeyAction | undefined => {
  const normalised = key.length === 1 ? key.toLowerCase() : key;

  return ALWAYS.get(normalised) ?? (context.manualFlight ? undefined : SEEKS.get(normalised));
};
