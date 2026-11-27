import {
  Color,
  DoubleSide,
  LineBasicMaterial,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
} from "three";
import type { Material } from "three";

export type DroneTone = "studio" | "xray" | "ghost" | "target";

export interface DroneColors {
  readonly accent: string;
  readonly ducts: string;
  readonly frame: string;
}

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

const XRAY_SHELL = "#22d3ee";

const translucent = (color: string, opacity: number) =>
  new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: DoubleSide,
  });

const glowing = (color: string, intensity: number) =>
  new MeshStandardMaterial({
    color: new Color(color).multiplyScalar(0.35),
    emissive: new Color(color),
    emissiveIntensity: intensity,
    roughness: 0.4,
    metalness: 0.1,
  });

const withAll = (materials: Omit<DroneMaterials, "all">): DroneMaterials => ({
  ...materials,
  all: Object.values(materials),
});

const studioMaterials = (colors: DroneColors) =>
  withAll({
    frame: new MeshPhysicalMaterial({
      color: colors.frame,
      roughness: 0.48,
      metalness: 0.15,
      clearcoat: 0.6,
      clearcoatRoughness: 0.35,
    }),
    ducts: new MeshPhysicalMaterial({
      color: colors.ducts,
      roughness: 0.55,
      metalness: 0.05,
      clearcoat: 0.3,
      side: DoubleSide,
    }),
    motor: new MeshStandardMaterial({ color: "#3a414c", roughness: 0.35, metalness: 0.85 }),
    motorBell: new MeshStandardMaterial({ color: "#aeb6c2", roughness: 0.22, metalness: 0.95 }),
    accent: glowing(colors.accent, 1.4),
    blade: new MeshPhysicalMaterial({
      color: "#0e1117",
      roughness: 0.3,
      metalness: 0,
      transparent: true,
      opacity: 0.92,
    }),
    disc: new MeshBasicMaterial({
      color: "#9fb4c8",
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: DoubleSide,
    }),
    pcb: new MeshStandardMaterial({ color: "#0c2219", roughness: 0.6, metalness: 0.2 }),
    chip: new MeshStandardMaterial({ color: "#14161b", roughness: 0.35, metalness: 0.3 }),
    imu: new MeshStandardMaterial({ color: "#1a1c22", roughness: 0.4, metalness: 0.3 }),
    baro: new MeshStandardMaterial({ color: "#b9c0c9", roughness: 0.3, metalness: 0.9 }),
    battery: new MeshPhysicalMaterial({
      color: "#161a22",
      roughness: 0.42,
      metalness: 0.1,
      clearcoat: 0.8,
    }),
    batteryLabel: glowing("#f5a524", 0.45),
    camera: new MeshStandardMaterial({ color: "#0f1115", roughness: 0.5, metalness: 0.3 }),
    lens: new MeshPhysicalMaterial({
      color: "#0a1622",
      roughness: 0.05,
      metalness: 0.4,
      clearcoat: 1,
    }),
    receiver: new MeshStandardMaterial({ color: "#22262e", roughness: 0.6 }),
    antenna: glowing(colors.accent, 0.9),
    noseLight: glowing("#22d3ee", 2.2),
    tailLight: glowing("#f05252", 1.8),
    edges: new LineBasicMaterial({ color: "#2c3646", transparent: true, opacity: 0 }),
  });

const xrayMaterials = (colors: DroneColors) =>
  withAll({
    frame: translucent(XRAY_SHELL, 0.06),
    ducts: translucent(XRAY_SHELL, 0.05),
    motor: translucent("#8fa3b8", 0.18),
    motorBell: translucent("#8fa3b8", 0.22),
    accent: glowing(colors.accent, 1.2),
    blade: translucent("#cbd5e1", 0.25),
    disc: new MeshBasicMaterial({
      color: "#67e8f9",
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: DoubleSide,
    }),
    pcb: glowing("#22d3ee", 0.55),
    chip: glowing("#67e8f9", 1.2),
    imu: glowing("#f472b6", 2.4),
    baro: glowing("#a3e635", 2.2),
    battery: translucent("#f5a524", 0.16),
    batteryLabel: glowing("#f5a524", 0.9),
    camera: translucent("#94a3b8", 0.2),
    lens: translucent("#94a3b8", 0.3),
    receiver: translucent("#94a3b8", 0.25),
    antenna: glowing(colors.accent, 0.8),
    noseLight: glowing("#22d3ee", 2.2),
    tailLight: glowing("#f05252", 1.8),
    edges: new LineBasicMaterial({ color: XRAY_SHELL, transparent: true, opacity: 0.55 }),
  });

const ghostMaterials = (tint: string, strength: number) => {
  const shell = translucent(tint, 0.16 * strength);
  const core = translucent(tint, 0.3 * strength);

  return withAll({
    frame: shell,
    ducts: translucent(tint, 0.1),
    motor: core,
    motorBell: core,
    accent: glowing(tint, 1.4),
    blade: translucent(tint, 0.22),
    disc: new MeshBasicMaterial({
      color: tint,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: DoubleSide,
    }),
    pcb: core,
    chip: core,
    imu: core,
    baro: core,
    battery: translucent(tint, 0.24),
    batteryLabel: glowing(tint, 0.8),
    camera: core,
    lens: core,
    receiver: core,
    antenna: glowing(tint, 0.8),
    noseLight: glowing(tint, 2),
    tailLight: glowing(tint, 1.2),
    edges: new LineBasicMaterial({ color: tint, transparent: true, opacity: 0.6 }),
  });
};

export const droneMaterials = (tone: DroneTone, colors: DroneColors): DroneMaterials => {
  if (tone === "xray") return xrayMaterials(colors);

  if (tone === "ghost") return ghostMaterials("#a78bfa", 1);

  if (tone === "target") return ghostMaterials("#e2e8f0", 0.55);

  return studioMaterials(colors);
};
