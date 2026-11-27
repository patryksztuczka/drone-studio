import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";

import { FollowCamera } from "../follow-camera.ts";
import type { PoseSampler } from "../pose-sampler.ts";

interface CameraRigProps {
  readonly sampler: PoseSampler;
  readonly follow: boolean;
  readonly cinematic: boolean;
}

export const CameraRig = ({ sampler, follow, cinematic }: CameraRigProps) => {
  const camera = useThree((state) => state.camera);
  const element = useThree((state) => state.gl.domElement);
  const rig = useMemo(() => new FollowCamera(camera, element), [camera, element]);

  useEffect(() => () => rig.dispose(), [rig]);

  useEffect(() => rig.cinematic(cinematic), [rig, cinematic]);

  useFrame((state, dt) => rig.update(sampler.read(state.clock.elapsedTime)?.position, follow, dt));

  return null;
};
