import type { RunSummary } from "@drone-studio/engine-client";

export const runTime = (createdAt: string) => {
  const match = /T(\d{2}):(\d{2}):(\d{2})/.exec(createdAt);

  return match === null ? createdAt : `${match[1] ?? ""}:${match[2] ?? ""}:${match[3] ?? ""}`;
};

export const runDay = (createdAt: string) => createdAt.slice(0, 10);

export const failedAssertions = (run: RunSummary) =>
  run.assertions.filter((assertion) => !assertion.passed).length;

export const paramSummary = (run: RunSummary) =>
  Object.entries(run.params)
    .map(([name, value]) => `${name}=${String(value)}`)
    .join(" ");
