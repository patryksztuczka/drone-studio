import {
  connectionState,
  ConnectionState,
  pauseSession,
  resetSession,
  runSmoke,
  sessionSpeed,
  startSession,
} from "@drone-studio/engine-client";
import type { EngineCallError } from "@drone-studio/engine-client";
import { useAtomValue } from "@effect/atom-react";
import { Cause, Option } from "effect";
import { AsyncResult } from "effect/reactivity";
import { useState } from "react";

import { rpcFailureTitle } from "../rpc-failure.ts";

const failureOf = (result: AsyncResult.AsyncResult<unknown, EngineCallError>) =>
  AsyncResult.isFailure(result) ? Cause.findErrorOption(result.cause) : Option.none();

export const RpcErrorToast = () => {
  const results = [
    useAtomValue(startSession),
    useAtomValue(pauseSession),
    useAtomValue(resetSession),
    useAtomValue(sessionSpeed),
    useAtomValue(runSmoke),
  ];

  const state = useAtomValue(connectionState);
  const [dismissed, setDismissed] = useState<EngineCallError | undefined>(undefined);
  const failure = results.map(failureOf).find(Option.isSome);

  if (failure === undefined || failure.value === dismissed) return null;

  const url = AsyncResult.isSuccess(state)
    ? ConnectionState.match(state.value, {
        Connecting: (connecting) => connecting.url,
        Connected: (connected) => connected.url,
        Offline: (offline) => offline.url,
      })
    : "";

  return (
    <div
      role="alert"
      className="absolute bottom-[52px] left-1/2 z-20 flex w-[400px] -translate-x-1/2 items-center gap-2.5 border border-fail bg-surface px-3.5 py-2.5 shadow-[0_10px_30px_#11111114]"
    >
      <span aria-hidden="true" className="size-[7px] shrink-0 rounded-full bg-fail" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-[13px] leading-4 text-ink">{rpcFailureTitle(failure.value)}</p>
        <p
          className="truncate font-label text-[10px] leading-3 text-faint"
          title={failure.value.message}
        >
          {url === "" ? failure.value.message : `drone-engine · ${url}`}
        </p>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(failure.value)}
        className="cursor-pointer text-[14px] leading-[18px] text-faint hover:text-ink"
      >
        ×
      </button>
    </div>
  );
};
