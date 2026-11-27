import type { SampleTable } from "@drone-studio/engine-client";

const MOTORS = ["motor_1", "motor_2", "motor_3", "motor_4"] as const;

export const meanCommand = (table: SampleTable, t: number) => {
  const values = MOTORS.map((column) => table.sample(column, t));
  const finite = values.filter((value) => Number.isFinite(value));

  return finite.length === 0 ? 0 : finite.reduce((sum, value) => sum + value, 0) / finite.length;
};

export const commandHistory = (table: SampleTable, t: number, bars: number, stepS: number) =>
  Array.from({ length: bars }, (_, index) => {
    const at = t - (bars - 1 - index) * stepS;

    return at < table.startTime || table.length === 0
      ? 0
      : Math.min(Math.max(meanCommand(table, at), 0), 1);
  });

export const leadingMotors = (thrust: ReadonlyArray<number>) => {
  const mean = thrust.reduce((sum, value) => sum + value, 0) / Math.max(thrust.length, 1);

  return thrust.map((value) => value > mean + 0.005);
};
