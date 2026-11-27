import type { BoardLayout } from "@drone-studio/engine-client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Line,
  LineBasicMaterial,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from "three";
import type { Group, Mesh } from "three";

import { PALETTE } from "../../../shared/palette.ts";
import { frdToScene } from "../frames-of-reference.ts";
import type { PoseSampler } from "../pose-sampler.ts";
import { fade, show } from "../scene-mutations.ts";
import type { DroneTone } from "./drone-materials.ts";
import { DroneModel } from "./drone-model.tsx";

const TRAIL_POINTS = 160;

const TRAIL_SECONDS = 8;

const THRUST_METRES_PER_NEWTON = 0.085;

const COOL = new Color(PALETTE.blue);

const HOT = new Color(PALETTE.fail);

const thrustColor = (command: number, out: Color) =>
  command < 0.85 ? out.copy(COOL) : out.copy(COOL).lerp(HOT, Math.min((command - 0.85) / 0.1, 1));

const shadowTexture = () => {
  const canvas = document.createElement("canvas");

  canvas.width = 128;
  canvas.height = 128;

  const context = canvas.getContext("2d");

  if (context !== null) {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);

    gradient.addColorStop(0, "rgba(17,17,17,0.22)");
    gradient.addColorStop(0.5, "rgba(17,17,17,0.08)");
    gradient.addColorStop(1, "rgba(17,17,17,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  }

  return new CanvasTexture(canvas);
};

interface ThrustVectorsProps {
  readonly layout: BoardLayout;
  readonly sampler: PoseSampler;
}

const fallbackMaterial = new MeshBasicMaterial({ color: COOL });

const ThrustVectors = ({ layout, sampler }: ThrustVectorsProps) => {
  const shafts = useRef<Array<Mesh | null>>([]);
  const heads = useRef<Array<Mesh | null>>([]);

  const geometry = useMemo(
    () => ({
      shaft: new CylinderGeometry(0.00028, 0.00028, 1, 6).translate(0, 0.5, 0),
      head: new ConeGeometry(0.0013, 0.0042, 12).translate(0, 0.0021, 0),
    }),
    [],
  );

  const materials = useMemo(
    () =>
      layout.airframe.rotors.map(
        () =>
          new MeshBasicMaterial({
            color: COOL,
            transparent: true,
            opacity: 1,
            depthWrite: false,
            depthTest: false,
          }),
      ),
    [layout],
  );

  useEffect(
    () => () => {
      geometry.shaft.dispose();
      geometry.head.dispose();

      for (const material of materials) material.dispose();
    },
    [geometry, materials],
  );

  useFrame((state) => {
    const pose = sampler.read(state.clock.elapsedTime);

    layout.airframe.rotors.forEach((_, index) => {
      const thrust = pose?.thrust[index] ?? 0;
      const command = pose?.motor[index] ?? 0;
      const length = Math.max(0.002, thrust * THRUST_METRES_PER_NEWTON);
      const shaft = shafts.current[index];
      const head = heads.current[index];
      const material = materials[index];

      if (material !== undefined) thrustColor(command, material.color);

      if (shaft !== null && shaft !== undefined) {
        shaft.scale.set(1, length, 1);
        shaft.visible = thrust > 0.005;
      }

      if (head !== null && head !== undefined) {
        head.position.y = 0.004 + length;
        head.visible = thrust > 0.005;
      }
    });
  });

  return (
    <group>
      {layout.airframe.rotors.map((rotor, index) => {
        const [x, y, z] = frdToScene(rotor.position_m);
        const material = materials[index] ?? fallbackMaterial;

        return (
          <group key={rotor.id} position={[x, y, z]}>
            <mesh
              ref={(mesh) => {
                shafts.current[index] = mesh;
              }}
              geometry={geometry.shaft}
              material={material}
              position={[0, 0.004, 0]}
              renderOrder={5}
            />
            <mesh
              ref={(mesh) => {
                heads.current[index] = mesh;
              }}
              geometry={geometry.head}
              material={material}
              renderOrder={5}
            />
          </group>
        );
      })}
    </group>
  );
};

const CenterOfMass = () => {
  const parts = useMemo(
    () => ({
      core: new SphereGeometry(0.0022, 16, 12),
      ring: new RingGeometry(0.0042, 0.0052, 40),
      coreMaterial: new MeshBasicMaterial({
        color: PALETTE.ink,
        depthTest: false,
        transparent: true,
      }),
      ringMaterial: new MeshBasicMaterial({
        color: PALETTE.ink,
        transparent: true,
        opacity: 0.7,
        depthTest: false,
        side: 2,
      }),
    }),
    [],
  );

  useEffect(
    () => () => {
      parts.core.dispose();
      parts.ring.dispose();
      parts.coreMaterial.dispose();
      parts.ringMaterial.dispose();
    },
    [parts],
  );

  return (
    <group renderOrder={10}>
      <mesh geometry={parts.core} material={parts.coreMaterial} renderOrder={10} />
      <mesh geometry={parts.ring} material={parts.ringMaterial} renderOrder={10} />
      <mesh
        geometry={parts.ring}
        material={parts.ringMaterial}
        rotation={[Math.PI / 2, 0, 0]}
        renderOrder={10}
      />
    </group>
  );
};

interface FlightRigProps {
  readonly layout: BoardLayout;
  readonly sampler: PoseSampler;
  readonly tone: DroneTone;
  readonly showTarget: boolean;
  readonly trailColor: string;
  readonly onBody?: (group: Group | null) => void;
}

export const FlightRig = ({
  layout,
  sampler,
  tone,
  showTarget,
  trailColor,
  onBody,
}: FlightRigProps) => {
  const body = useRef<Group>(null);
  const target = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  const xray = tone === "xray";
  const solid = tone === "studio" || tone === "xray";

  const trailParts = useMemo(() => {
    const geometry = new BufferGeometry();
    const positions = new Float32Array(TRAIL_POINTS * 3);
    const colors = new Float32Array(TRAIL_POINTS * 3);
    const tint = new Color(trailColor);
    const background = new Color(PALETTE.ground);

    for (let index = 0; index < TRAIL_POINTS; index += 1) {
      const mixed = background.clone().lerp(tint, (index / (TRAIL_POINTS - 1)) ** 1.6);

      colors.set([mixed.r, mixed.g, mixed.b], index * 3);
    }

    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("color", new BufferAttribute(colors, 3));

    const material = new LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
    });

    return { geometry, material, line: new Line(geometry, material) };
  }, [trailColor]);

  const shadowParts = useMemo(
    () => ({
      geometry: new PlaneGeometry(1, 1),
      material: new MeshBasicMaterial({
        map: shadowTexture(),
        transparent: true,
        depthWrite: false,
        opacity: 1,
      }),
    }),
    [],
  );

  useEffect(
    () => () => {
      trailParts.geometry.dispose();
      trailParts.material.dispose();
      shadowParts.geometry.dispose();
      shadowParts.material.map?.dispose();
      shadowParts.material.dispose();
    },
    [trailParts, shadowParts],
  );

  useEffect(() => {
    onBody?.(body.current);

    return () => onBody?.(null);
  }, [onBody]);

  const scratch = useMemo(() => new Vector3(), []);

  useFrame((state) => {
    const stamp = state.clock.elapsedTime;
    const pose = sampler.read(stamp);
    const visible = pose !== undefined;

    if (body.current !== null) {
      body.current.visible = visible;

      if (pose !== undefined) {
        body.current.position.set(...pose.position);
        body.current.quaternion.set(
          pose.attitude.x,
          pose.attitude.y,
          pose.attitude.z,
          pose.attitude.w,
        );
      }
    }

    if (target.current !== null) {
      target.current.visible = visible && showTarget;

      if (pose !== undefined) {
        target.current.position.set(...pose.position);
        target.current.quaternion.set(
          pose.setpoint.x,
          pose.setpoint.y,
          pose.setpoint.z,
          pose.setpoint.w,
        );
      }
    }

    if (shadow.current !== null && pose !== undefined) {
      const height = Math.max(pose.position[1], 0);
      const spread = 0.13 + height * 0.09;

      shadow.current.position.set(pose.position[0], 0.0006, pose.position[2]);
      shadow.current.scale.set(spread, spread, 1);
      fade(shadowParts.material, 1 / (1 + height * 1.4));
    }

    {
      const points = sampler.trail(stamp, TRAIL_SECONDS, TRAIL_POINTS);
      const attribute = trailParts.geometry.getAttribute("position");

      if (points.length === TRAIL_POINTS && attribute instanceof BufferAttribute) {
        points.forEach((point, index) => {
          scratch.set(...point);
          attribute.setXYZ(index, scratch.x, scratch.y, scratch.z);
        });
        attribute.needsUpdate = true;
        trailParts.geometry.computeBoundingSphere();
      }

      show(trailParts.line, xray && points.length === TRAIL_POINTS);
    }
  });

  return (
    <group>
      <group ref={body}>
        <DroneModel layout={layout} tone={tone} sampler={sampler} />
        {solid ? <ThrustVectors layout={layout} sampler={sampler} /> : null}
        {xray ? <CenterOfMass /> : null}
      </group>
      <group ref={target}>
        <DroneModel layout={layout} tone="target" sampler={sampler} />
      </group>
      <mesh
        ref={shadow}
        geometry={shadowParts.geometry}
        material={shadowParts.material}
        rotation={[-Math.PI / 2, 0, 0]}
      />
      <primitive object={trailParts.line} />
    </group>
  );
};
