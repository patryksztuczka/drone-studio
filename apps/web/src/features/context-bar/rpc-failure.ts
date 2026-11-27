import type { EngineCallError } from "@drone-studio/engine-client";
import { Match } from "effect";

const shortReason = Match.type<EngineCallError>().pipe(
  Match.tagsExhaustive({
    EngineOfflineError: () => "engine offline",
    EngineRefusedError: (error) => error.reason,
    EngineTimeoutError: () => "no answer in time",
    EngineReplyError: () => "reply Studio cannot read",
  }),
);

export const rpcFailureTitle = (error: EngineCallError) =>
  `${error.method} failed: ${shortReason(error)}`;
