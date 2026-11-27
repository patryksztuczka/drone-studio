import type { SampleTable } from "@drone-studio/engine-client";

export type ArmLabel = "DISARMED" | "ARMED" | "FAILSAFE";

export interface HudReadout {
  readonly t: number;
  readonly height: number;
  readonly climb: number;
  readonly groundSpeed: number;
  readonly roll: number;
  readonly pitch: number;
  readonly yaw: number;
  readonly setpointRoll: number;
  readonly setpointPitch: number;
  readonly voltage: number;
  readonly current: number;
  readonly charge: number;
  readonly wind: number;
  readonly windFrom: number;
  readonly arm: ArmLabel;
  readonly altitudeHold: boolean;
  readonly saturated: boolean;
}

const ALT_HOLD_FLAG = 1 << 1;

const armLabel = (state: number): ArmLabel => {
  if (state >= 1.5) return "FAILSAFE";

  return state >= 0.5 ? "ARMED" : "DISARMED";
};

export const hudReadout = (table: SampleTable, t: number): HudReadout => {
  const read = (name: string) => {
    const value = table.sample(name, t);

    return Number.isFinite(value) ? value : 0;
  };

  const windNorth = read("wind_n");
  const windEast = read("wind_e");

  return {
    t,
    height: read("height"),
    climb: -read("vel_d"),
    groundSpeed: Math.hypot(read("vel_n"), read("vel_e")),
    roll: read("roll"),
    pitch: read("pitch"),
    yaw: read("yaw"),
    setpointRoll: read("sp_roll"),
    setpointPitch: read("sp_pitch"),
    voltage: read("bat_v"),
    current: read("bat_a"),
    charge: read("bat_soc"),
    wind: Math.hypot(windNorth, windEast, read("wind_d")),
    windFrom: ((Math.atan2(-windEast, -windNorth) * 180) / Math.PI + 360) % 360,
    arm: armLabel(read("arm_state")),
    altitudeHold: (Math.round(read("status")) & ALT_HOLD_FLAG) !== 0,
    saturated: read("saturated") >= 0.5,
  };
};

export const separation = (active: SampleTable, ghost: SampleTable, t: number) => {
  const gap = (name: string) => active.sample(name, t) - ghost.sample(name, t);
  const distance = Math.hypot(gap("pos_n"), gap("pos_e"), gap("pos_d"));

  return {
    distance: Number.isFinite(distance) ? distance : 0,
    roll: gap("roll"),
    pitch: gap("pitch"),
  };
};
