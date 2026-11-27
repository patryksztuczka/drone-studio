export type ThrustBand = "low" | "mid" | "high";

export const thrustBand = (command: number): ThrustBand => {
  if (command > 0.8) return "high";

  return command >= 0.55 ? "mid" : "low";
};
