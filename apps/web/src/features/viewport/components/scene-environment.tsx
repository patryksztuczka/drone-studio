import { useThree } from "@react-three/fiber";
import { useEffect } from "react";

import { applyStudioEnvironment } from "../studio-environment.ts";

export const SceneEnvironment = () => {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => applyStudioEnvironment(gl, scene), [gl, scene]);

  return (
    <>
      <hemisphereLight args={["#ffffff", "#dfe9f7", 1.6]} />
      <directionalLight position={[1.5, 4, 2.5]} intensity={1.6} color="#ffffff" />
      <directionalLight position={[-3, 1.4, -2.2]} intensity={0.6} color="#cfe3ff" />
    </>
  );
};
