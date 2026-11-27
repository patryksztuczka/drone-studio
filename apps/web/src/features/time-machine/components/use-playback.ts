import { focusTarget } from "@drone-studio/engine-client";
import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { Option } from "effect";
import type { AtomRegistry } from "effect/reactivity";
import { useContext, useEffect, useRef } from "react";

import {
  activeFlight,
  cursor,
  focusNotice,
  followLive,
  PlaybackSource,
  playbackSource,
  replayPlaying,
  replayRate,
  studioModule,
} from "../../../shared/studio.atoms.ts";
import { advancePlayback } from "../timeline-math.ts";

export const usePlaybackClock = () => {
  const registry = useContext(RegistryContext);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = (now - last) / 1000;

      last = now;

      if (PlaybackSource.guards.Run(registry.get(playbackSource)) && registry.get(replayPlaying)) {
        Option.map(registry.get(activeFlight), (flight) => {
          const span = { start: flight.table.startTime, end: flight.table.endTime };
          const step = advancePlayback(registry.get(cursor), dt, registry.get(replayRate), span);

          registry.set(cursor, step.t);

          if (step.ended) registry.set(replayPlaying, false);
        });
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [registry]);
};

export const useStudioFocus = () => {
  const registry = useContext(RegistryContext);
  const target = useAtomValue(focusTarget);
  const handled = useRef(0);

  useEffect(() => {
    if (Option.isNone(target) || target.value.sequence === handled.current) return;

    handled.current = target.value.sequence;
    registry.set(playbackSource, PlaybackSource.cases.Run.make({ runId: target.value.runId }));
    registry.set(followLive, false);
    registry.set(replayPlaying, false);
    registry.set(cursor, target.value.t);
    registry.set(studioModule, "runs");
    registry.set(focusNotice, Option.some(target.value));
  }, [registry, target]);
};

export const seekTo = (registry: AtomRegistry.AtomRegistry, t: number) => {
  registry.set(followLive, false);
  registry.set(cursor, t);
};
