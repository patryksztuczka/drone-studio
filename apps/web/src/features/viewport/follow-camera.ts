import { Vector3 } from "three";
import type { Camera } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { Triple } from "./frames-of-reference.ts";

export class FollowCamera {
  private readonly controls: OrbitControls;
  private readonly camera: Camera;
  private readonly desired = new Vector3();
  private readonly shift = new Vector3();

  constructor(camera: Camera, element: HTMLElement) {
    this.camera = camera;
    this.controls = new OrbitControls(camera, element);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.08;
    this.controls.maxDistance = 30;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.target.set(0, 0.05, 0);
    camera.position.set(0.26, 0.17, 0.32);
  }

  cinematic(on: boolean) {
    this.controls.autoRotate = on;
    this.controls.autoRotateSpeed = 0.55;
  }

  update(target: Triple | undefined, follow: boolean, dt: number) {
    if (follow && target !== undefined) {
      this.desired.set(...target);
      this.shift
        .copy(this.desired)
        .sub(this.controls.target)
        .multiplyScalar(1 - Math.exp(-dt * 40));
      this.controls.target.add(this.shift);
      this.camera.position.add(this.shift);
    }

    this.controls.update(dt);
  }

  dispose() {
    this.controls.dispose();
  }
}
