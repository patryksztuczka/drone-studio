import { DoubleSide, LineBasicMaterial, MeshBasicMaterial, MeshPhysicalMaterial } from "three";
import type { Material } from "three";

import { PALETTE } from "../../../shared/palette.ts";

export type DroneTone = "studio" | "xray" | "ghost" | "target";

export interface DroneMaterials {
  readonly frame: Material;
  readonly ducts: Material;
  readonly motor: Material;
  readonly motorBell: Material;
  readonly accent: Material;
  readonly blade: Material;
  readonly disc: MeshBasicMaterial;
  readonly pcb: Material;
  readonly chip: Material;
  readonly imu: Material;
  readonly baro: Material;
  readonly battery: Material;
  readonly batteryLabel: Material;
  readonly camera: Material;
  readonly lens: Material;
  readonly receiver: Material;
  readonly antenna: Material;
  readonly noseLight: Material;
  readonly tailLight: Material;
  readonly edges: LineBasicMaterial;
  readonly all: ReadonlyArray<Material>;
}

const glass = (color: string, opacity: number) =>
  new MeshPhysicalMaterial({
    color,
    transparent: true,
    opacity,
    roughness: 0.18,
    metalness: 0,
    clearcoat: 0.8,
    clearcoatRoughness: 0.2,
    emissive: color,
    emissiveIntensity: 0.18,
    depthWrite: false,
    side: DoubleSide,
  });

const flat = (color: string, opacity: number) =>
  new MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
    side: DoubleSide,
  });

const edgeLines = (color: string, opacity: number) =>
  new LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });

const disc = (color: string) =>
  new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: DoubleSide,
  });

const withAll = (materials: Omit<DroneMaterials, "all">): DroneMaterials => ({
  ...materials,
  all: Object.values(materials),
});

const studioMaterials = () =>
  withAll({
    frame: glass(PALETTE.blueGlass, 0.62),
    ducts: glass(PALETTE.blueMist, 0.3),
    motor: glass(PALETTE.blue, 0.75),
    motorBell: glass("#3d9bff", 0.7),
    accent: flat(PALETTE.blue, 1),
    blade: flat(PALETTE.blue, 0.42),
    disc: disc(PALETTE.blueGlass),
    pcb: glass("#bfe3ff", 0.7),
    chip: glass(PALETTE.blue, 0.85),
    imu: glass("#e6f4ff", 0.95),
    baro: glass(PALETTE.blueGlass, 0.9),
    battery: glass("#6bb8ff", 0.42),
    batteryLabel: glass(PALETTE.blue, 0.55),
    camera: glass("#8ccbff", 0.5),
    lens: glass(PALETTE.blue, 0.8),
    receiver: glass("#8ccbff", 0.5),
    antenna: flat(PALETTE.blue, 0.9),
    noseLight: flat(PALETTE.blue, 1),
    tailLight: flat(PALETTE.fail, 1),
    edges: edgeLines(PALETTE.blue, 0.85),
  });

const xrayMaterials = () =>
  withAll({
    frame: glass(PALETTE.blueGlass, 0.14),
    ducts: glass(PALETTE.blueMist, 0.1),
    motor: glass(PALETTE.blue, 0.3),
    motorBell: glass("#3d9bff", 0.25),
    accent: flat(PALETTE.blue, 1),
    blade: flat(PALETTE.blue, 0.25),
    disc: disc(PALETTE.blueGlass),
    pcb: glass("#bfe3ff", 0.55),
    chip: flat(PALETTE.blue, 0.9),
    imu: flat(PALETTE.blue, 1),
    baro: flat(PALETTE.ink, 0.85),
    battery: glass(PALETTE.amberGlass, 0.3),
    batteryLabel: flat(PALETTE.amber, 0.7),
    camera: glass("#8ccbff", 0.15),
    lens: glass(PALETTE.blue, 0.3),
    receiver: glass("#8ccbff", 0.15),
    antenna: flat(PALETTE.blue, 0.5),
    noseLight: flat(PALETTE.blue, 1),
    tailLight: flat(PALETTE.fail, 1),
    edges: edgeLines(PALETTE.blue, 0.55),
  });

const faintMaterials = (fill: string, edge: string, strength: number) => {
  const shell = glass(fill, 0.1 * strength);
  const core = glass(fill, 0.22 * strength);

  return withAll({
    frame: shell,
    ducts: glass(fill, 0.07 * strength),
    motor: core,
    motorBell: core,
    accent: flat(edge, 0.4 * strength),
    blade: flat(edge, 0.18 * strength),
    disc: disc(fill),
    pcb: core,
    chip: core,
    imu: core,
    baro: core,
    battery: glass(fill, 0.14 * strength),
    batteryLabel: core,
    camera: core,
    lens: core,
    receiver: core,
    antenna: flat(edge, 0.3 * strength),
    noseLight: flat(edge, 0.5 * strength),
    tailLight: flat(edge, 0.5 * strength),
    edges: edgeLines(edge, 0.3 * strength),
  });
};

export const droneMaterials = (tone: DroneTone): DroneMaterials => {
  if (tone === "xray") return xrayMaterials();

  if (tone === "ghost") return faintMaterials(PALETTE.blueGlass, PALETTE.blue, 1);

  if (tone === "target") return faintMaterials("#d0d0d0", PALETTE.ink, 0.9);

  return studioMaterials();
};
