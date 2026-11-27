import {
  pauseSession,
  resetSession,
  sessionSpeed,
  startSession,
} from "@drone-studio/engine-client";
import { RegistryContext, useAtomSet, useAtomValue } from "@effect/atom-react";
import { Option } from "effect";
import { Atom } from "effect/reactivity";
import { useContext } from "react";

import { flyingChoice } from "./session-choice.ts";
import {
  activeFlight,
  cursor,
  followLive,
  liveSession,
  MANUAL_SCENARIO,
  PlaybackSource,
  playbackSource,
  replayPlaying,
  replayRate,
  scenarios,
  selectedScenario,
} from "./studio.atoms.ts";

export const liveSpeed = Atom.make(1).pipe(Atom.keepAlive);

export const SPEEDS = [0.1, 0.25, 0.5, 1, 2, 4] as const;

export interface Transport {
  readonly live: boolean;
  readonly hasLiveSession: boolean;
  readonly playing: boolean;
  readonly speed: number;
  readonly toggle: () => void;
  readonly reset: () => void;
  readonly setSpeed: (speed: number) => void;
  readonly startManual: () => void;
  readonly startScenario: () => void;
  readonly goLive: () => void;
}

export const useTransport = (): Transport => {
  const registry = useContext(RegistryContext);
  const source = useAtomValue(playbackSource);
  const session = useAtomValue(liveSession);
  const replaying = useAtomValue(replayPlaying);
  const rate = useAtomValue(replayRate);
  const chosenLiveSpeed = useAtomValue(liveSpeed);
  const live = PlaybackSource.guards.Live(source);
  const start = useAtomSet(startSession);
  const pause = useAtomSet(pauseSession);
  const restart = useAtomSet(resetSession);
  const retime = useAtomSet(sessionSpeed);

  const sessionRunning = Option.match(session, {
    onNone: () => false,
    onSome: (status) => !status.paused && !status.finished,
  });

  const begin = (mode: "scenario" | "manual") => {
    const chosen = registry.get(selectedScenario);
    const fallback = registry.get(scenarios)[0]?.id;
    const scenario = chosen === MANUAL_SCENARIO ? undefined : (chosen ?? fallback);
    const manual = mode === "manual" || chosen === MANUAL_SCENARIO;

    registry.set(playbackSource, PlaybackSource.cases.Live.make({}));
    registry.set(followLive, true);
    start({
      mode: manual ? "manual" : "scenario",
      scenario: manual ? undefined : scenario,
      speed: manual ? 1 : registry.get(liveSpeed),
    });
  };

  const toggleLive = () => {
    const status = registry.get(liveSession);

    if (
      Option.isNone(status) ||
      status.value.finished ||
      (status.value.paused &&
        !flyingChoice(status.value, registry.get(selectedScenario), MANUAL_SCENARIO))
    ) {
      begin("scenario");

      return;
    }

    registry.set(followLive, true);
    pause(!status.value.paused);
  };

  const toggleReplay = () => {
    const flight = registry.get(activeFlight);
    const end = Option.match(flight, { onNone: () => 0, onSome: (view) => view.table.endTime });

    if (!registry.get(replayPlaying) && registry.get(cursor) >= end - 0.01) registry.set(cursor, 0);

    registry.set(replayPlaying, !registry.get(replayPlaying));
  };

  return {
    live,
    hasLiveSession: Option.exists(session, (status) => !status.finished),
    playing: live ? sessionRunning : replaying,
    speed: live
      ? Option.match(session, { onNone: () => chosenLiveSpeed, onSome: (s) => s.speed })
      : rate,
    toggle: () =>
      PlaybackSource.guards.Live(registry.get(playbackSource)) ? toggleLive() : toggleReplay(),
    reset: () => {
      if (PlaybackSource.guards.Live(registry.get(playbackSource))) {
        if (Option.isSome(registry.get(liveSession))) restart();

        registry.set(followLive, true);

        return;
      }

      registry.set(replayPlaying, false);
      registry.set(cursor, 0);
    },
    setSpeed: (speed) => {
      if (PlaybackSource.guards.Live(registry.get(playbackSource))) {
        registry.set(liveSpeed, speed);

        if (Option.isSome(registry.get(liveSession))) retime(speed);

        return;
      }

      registry.set(replayRate, speed);
    },
    startManual: () => {
      registry.set(selectedScenario, MANUAL_SCENARIO);
      begin("manual");
    },
    startScenario: () => begin("scenario"),
    goLive: () => {
      registry.set(playbackSource, PlaybackSource.cases.Live.make({}));
      registry.set(replayPlaying, false);
      registry.set(followLive, true);
    },
  };
};
