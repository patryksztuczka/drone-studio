export interface SessionIdentity {
  readonly mode: "scenario" | "manual";
  readonly scenario: string;
}

export const flyingChoice = (
  session: SessionIdentity,
  chosen: string | undefined,
  manual: string,
): boolean => {
  if (chosen === undefined) return true;

  if (chosen === manual) return session.mode === "manual";

  return session.mode === "scenario" && session.scenario === chosen;
};
