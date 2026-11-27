import { useThree } from "@react-three/fiber";
import { useEffect } from "react";

import { applyStudioEnvironment } from "../studio-environment.ts";

export const SceneEnvironment = () => {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => applyStudioEnvironment(gl, scene), [gl, scene]);

  return (
    <>
      <hemisphereLight args={["#9fb7d4", "#0b0e14", 0.45]} />
      <directionalLight position={[2.5, 4, 1.8]} intensity={2.4} color="#fff4e6" />
      <directionalLight position={[-3, 1.4, -2.2]} intensity={1.3} color="#22d3ee" />
      <directionalLight position={[0.5, 2, 3.5]} intensity={0.6} color="#c4b5fd" />
    </>
  );
};
