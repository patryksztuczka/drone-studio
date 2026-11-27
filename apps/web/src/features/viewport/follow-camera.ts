import { Vector3 } from "three";
import type { OrthographicCamera } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { fitZoom, frameAll, ISOMETRIC_DIRECTION } from "./camera-framing.ts";
import type { Triple } from "./frames-of-reference.ts";

const CAMERA_DISTANCE_M = 2;

export class FollowCamera {
  private readonly controls: OrbitControls;
  private readonly camera: OrthographicCamera;
  private readonly desired = new Vector3();
  private readonly shift = new Vector3();
  private fit = 0;
  private framed = false;

  constructor(camera: OrthographicCamera, element: HTMLElement) {
    this.camera = camera;
    this.controls = new OrbitControls(camera, element);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.target.set(0, 0.01, 0);

    const direction = new Vector3(...ISOMETRIC_DIRECTION).normalize();

    camera.position.copy(direction.multiplyScalar(CAMERA_DISTANCE_M)).add(this.controls.target);
    camera.near = 0.01;
    camera.far = 60;
  }

  resize(width: number, height: number) {
    const next = fitZoom(width, height);

    this.camera.zoom = this.fit > 0 ? (this.camera.zoom / this.fit) * next : next;
    this.fit = next;
    this.controls.minZoom = next * 0.02;
    this.controls.maxZoom = next * 6;
    this.camera.updateProjectionMatrix();
  }

  cinematic(on: boolean) {
    this.controls.autoRotate = on;
    this.controls.autoRotateSpeed = 0.55;
  }

  update(targets: ReadonlyArray<Triple>, follow: boolean, framing: boolean, dt: number) {
    const settle = 1 - Math.exp(-dt * 5);

    if (follow && targets.length > 0) {
      const element = this.controls.domElement;
      const width = element?.clientWidth ?? 1;
      const height = element?.clientHeight ?? 1;
      const view = frameAll(framing ? targets : targets.slice(0, 1), width, height);

      this.desired.set(...view.centre);
      this.shift.copy(this.desired).sub(this.controls.target);
      this.controls.target.add(this.shift);
      this.camera.position.add(this.shift);

      if (framing) {
        this.framed = true;
        this.camera.zoom += (view.zoom - this.camera.zoom) * settle;
        this.camera.updateProjectionMatrix();
      }
    }

    if (!framing && this.framed) {
      this.camera.zoom += (this.fit - this.camera.zoom) * settle;
      this.camera.updateProjectionMatrix();

      if (Math.abs(this.fit - this.camera.zoom) < this.fit * 0.01) this.framed = false;
    }

    this.controls.update(dt);
  }

  dispose() {
    this.controls.dispose();
  }
}
