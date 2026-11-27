import type { Material, Object3D } from "three";

export const fade = (material: Material, opacity: number) => {
  material.opacity = opacity;
};

export const show = (object: Object3D, visible: boolean) => {
  object.visible = visible;
};
