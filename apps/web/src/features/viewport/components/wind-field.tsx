import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";

import type { PoseSampler } from "../pose-sampler.ts";
import { WindStreaks } from "../wind-streaks.ts";

interface WindFieldProps {
  readonly sampler: PoseSampler;
}

export const WindField = ({ sampler }: WindFieldProps) => {
  const streaks = useMemo(() => new WindStreaks(), []);

  useEffect(() => () => streaks.dispose(), [streaks]);

  useFrame((state, dt) => streaks.update(sampler.read(state.clock.elapsedTime), dt));

  return <primitive object={streaks.object} />;
};
