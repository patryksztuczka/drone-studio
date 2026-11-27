import { liveRecording, runSpectrum } from "@drone-studio/engine-client";
import type { Spectrum } from "@drone-studio/engine-client";
import { Option } from "effect";
import { AsyncResult, Atom } from "effect/reactivity";

import { PlaybackSource, playbackSource, playhead } from "../../shared/studio.atoms.ts";

export const activeSpectrum = Atom.make((get): Option.Option<Spectrum> =>
  PlaybackSource.match(get(playbackSource), {
    Live: () =>
      Option.flatMap(get(liveRecording), (recording) => Option.fromUndefinedOr(recording.spectrum)),
    Run: (source) => {
      const result = get(runSpectrum(source.runId, get(playhead)));

      if (AsyncResult.isSuccess(result)) return Option.some(result.value);

      return Option.flatten(get.self<Option.Option<Spectrum>>());
    },
  }),
);
