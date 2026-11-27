import { PMREMGenerator } from "three";
import type { Scene, WebGLRenderer } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export const applyStudioEnvironment = (renderer: WebGLRenderer, scene: Scene) => {
  const generator = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = generator.fromScene(room, 0.04).texture;

  scene.environment = environment;
  scene.environmentIntensity = 0.9;
  scene.background = null;
  renderer.setClearColor(0x000000, 0);

  return () => {
    scene.environment = null;
    environment.dispose();
    room.dispose();
    generator.dispose();
  };
};
