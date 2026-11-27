import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { OrthographicCamera } from "three";

import { FollowCamera } from "../follow-camera.ts";
import type { Triple } from "../frames-of-reference.ts";
import type { PoseSampler } from "../pose-sampler.ts";

interface CameraRigProps {
  readonly samplers: ReadonlyArray<PoseSampler>;
  readonly follow: boolean;
  readonly framing: boolean;
  readonly cinematic: boolean;
}

export const CameraRig = ({ samplers, follow, framing, cinematic }: CameraRigProps) => {
  const camera = useThree((state) => state.camera);
  const element = useThree((state) => state.gl.domElement);
  const size = useThree((state) => state.size);

  const rig = useMemo(
    () => (camera instanceof OrthographicCamera ? new FollowCamera(camera, element) : undefined),
    [camera, element],
  );

  useEffect(() => () => rig?.dispose(), [rig]);

  useEffect(() => rig?.resize(size.width, size.height), [rig, size.width, size.height]);

  useEffect(() => rig?.cinematic(cinematic), [rig, cinematic]);

  useFrame((state, dt) => {
    const targets: Array<Triple> = [];

    for (const sampler of samplers) {
      const pose = sampler.read(state.clock.elapsedTime);

      if (pose !== undefined) targets.push(pose.position);
    }

    rig?.update(targets, follow, framing, dt);
  });

  return null;
};
