import type { SticksMode } from "@drone-studio/engine-client";

export interface Sticks {
  readonly roll: number;
  readonly pitch: number;
  readonly yaw: number;
  readonly throttle: number;
  readonly arm: boolean;
  readonly mode: SticksMode;
}

export const RESTING_STICKS: Sticks = {
  roll: 0,
  pitch: 0,
  yaw: 0,
  throttle: 0.5,
  arm: false,
  mode: "althold",
};

export const DEADZONE = 0.06;

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

export const deadzone = (value: number, zone = DEADZONE) => {
  const magnitude = Math.abs(value);

  if (!Number.isFinite(value) || magnitude <= zone) return 0;

  return Math.sign(value) * Math.min((magnitude - zone) / (1 - zone), 1);
};

export const expo = (value: number, amount = 0.3) => value * (1 - amount) + value ** 3 * amount;

export type GamepadLayout = "standard" | "rc";

export interface PadState {
  readonly layout: GamepadLayout;
  readonly axes: ReadonlyArray<number>;
  readonly buttons: ReadonlyArray<boolean>;
}

export interface PadEdges {
  readonly arm: boolean;
  readonly mode: boolean;
}

const ARM_BUTTON = 0;

const MODE_BUTTON = 3;

export const padEdges = (current: PadState, previous: PadState | undefined): PadEdges => {
  const pressed = (index: number) =>
    (current.buttons[index] ?? false) && !(previous?.buttons[index] ?? false);

  return { arm: pressed(ARM_BUTTON), mode: pressed(MODE_BUTTON) };
};

export const sticksFromPad = (pad: PadState, held: Sticks): Sticks => {
  const axis = (index: number) => pad.axes[index] ?? 0;

  if (pad.layout === "rc") {
    return {
      ...held,
      roll: expo(deadzone(axis(0), 0.02)),
      pitch: expo(deadzone(axis(1), 0.02)),
      throttle: clamp((axis(2) + 1) / 2, 0, 1),
      yaw: expo(deadzone(axis(3), 0.02)),
    };
  }

  return {
    ...held,
    yaw: expo(deadzone(axis(0))),
    throttle: clamp((1 - deadzone(axis(1))) / 2, 0, 1),
    roll: expo(deadzone(axis(2))),
    pitch: expo(-deadzone(axis(3))),
  };
};

export const withEdges = (sticks: Sticks, edges: PadEdges): Sticks => ({
  ...sticks,
  arm: edges.arm ? !sticks.arm : sticks.arm,
  mode: edges.mode ? (sticks.mode === "althold" ? "angle" : "althold") : sticks.mode,
});

const KEY_DEFLECTION = 0.45;

const slew = (current: number, target: number, dt: number, rate: number) => {
  const step = rate * dt;

  return current + clamp(target - current, -step, step);
};

export const sticksFromKeys = (keys: ReadonlySet<string>, held: Sticks, dt: number): Sticks => {
  const boost = keys.has("Shift") ? 2 : 1;

  const axis = (positive: string, negative: string) =>
    clamp(
      ((keys.has(positive) ? 1 : 0) - (keys.has(negative) ? 1 : 0)) * KEY_DEFLECTION * boost,
      -1,
      1,
    );

  const climb = (keys.has("w") ? 1 : 0) - (keys.has("s") ? 1 : 0);

  const throttle =
    held.mode === "althold"
      ? slew(held.throttle, 0.5 + climb * 0.35, dt, 3)
      : clamp(held.throttle + climb * 0.5 * dt, 0, 1);

  return {
    ...held,
    roll: slew(held.roll, axis("ArrowRight", "ArrowLeft"), dt, 4),
    pitch: slew(held.pitch, axis("ArrowUp", "ArrowDown"), dt, 4),
    yaw: slew(held.yaw, axis("d", "a"), dt, 4),
    throttle,
  };
};

export const FLIGHT_KEYS: ReadonlySet<string> = new Set([
  "w",
  "a",
  "s",
  "d",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Shift",
]);

export const flightKey = (key: string) => (key.length === 1 ? key.toLowerCase() : key);
