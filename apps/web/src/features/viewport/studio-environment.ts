import { Color, Fog, PMREMGenerator } from "three";
import type { Scene, WebGLRenderer } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const BACKGROUND = "#0b0e14";

export const applyStudioEnvironment = (renderer: WebGLRenderer, scene: Scene) => {
  const generator = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = generator.fromScene(room, 0.035).texture;

  scene.environment = environment;
  scene.environmentIntensity = 0.55;
  scene.background = new Color(BACKGROUND);
  scene.fog = new Fog(BACKGROUND, 4, 34);

  return () => {
    scene.environment = null;
    environment.dispose();
    room.dispose();
    generator.dispose();
  };
};
