import type { BoardLayout, LayoutRotor } from "@drone-studio/engine-client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  EdgesGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  SphereGeometry,
  Vector2,
} from "three";
import type { BufferGeometry, Group, Mesh } from "three";
import * as three from "three";

import { frdSizeToScene, frdToScene } from "../frames-of-reference.ts";
import type { Triple } from "../frames-of-reference.ts";
import type { PoseSampler } from "../pose-sampler.ts";
import { fade, show } from "../scene-mutations.ts";
import { droneMaterials } from "./drone-materials.ts";
import type { DroneTone } from "./drone-materials.ts";

const PLATE_Y = -0.0055;

const PLATE_HALF = 0.021;

const DUCT_WALL = 0.0016;

const DUCT_CLEARANCE = 0.0012;

const MAX_VISUAL_REV_PER_S = 22;

const TWO_PI = Math.PI * 2;

const platePlan = () => {
  const r = PLATE_HALF;
  const c = 0.009;
  const outline = new three.Shape();

  outline.moveTo(-r + c, -r);
  outline.lineTo(r - c, -r);
  outline.quadraticCurveTo(r, -r, r, -r + c);
  outline.lineTo(r, r - c);
  outline.quadraticCurveTo(r, r, r - c, r);
  outline.lineTo(-r + c, r);
  outline.quadraticCurveTo(-r, r, -r, r - c);
  outline.lineTo(-r, -r + c);
  outline.quadraticCurveTo(-r, -r, -r + c, -r);

  const geometry = new ExtrudeGeometry(outline, {
    depth: 0.0024,
    bevelEnabled: true,
    bevelThickness: 0.0004,
    bevelSize: 0.0006,
    bevelSegments: 2,
  });

  geometry.rotateX(-Math.PI / 2);

  return geometry;
};

const ductProfile = (inner: number) => {
  const outer = inner + DUCT_WALL;
  const bottom = -0.0075;
  const top = 0.0045;

  return new LatheGeometry(
    [
      new Vector2(inner, bottom),
      new Vector2(inner, top - 0.0016),
      new Vector2(inner + 0.0018, top),
      new Vector2(outer + 0.0022, top),
      new Vector2(outer + 0.0006, top - 0.003),
      new Vector2(outer, bottom + 0.001),
      new Vector2(outer - 0.0004, bottom),
      new Vector2(inner, bottom),
    ],
    72,
  );
};

const bladeGeometry = (radius: number) => {
  const geometry = new BoxGeometry(radius - 0.0035, 0.0006, 0.0062);

  geometry.translate((radius - 0.0035) / 2 + 0.0028, 0, 0);

  return geometry;
};

interface Parts {
  readonly plate: BufferGeometry;
  readonly plateEdges: BufferGeometry;
  readonly arm: BufferGeometry;
  readonly duct: BufferGeometry;
  readonly ductEdges: BufferGeometry;
  readonly motorBase: BufferGeometry;
  readonly motorBell: BufferGeometry;
  readonly motorRing: BufferGeometry;
  readonly hub: BufferGeometry;
  readonly blade: BufferGeometry;
  readonly disc: BufferGeometry;
  readonly unitBox: BufferGeometry;
  readonly lens: BufferGeometry;
  readonly antenna: BufferGeometry;
  readonly led: BufferGeometry;
  readonly all: ReadonlyArray<BufferGeometry>;
}

const makeParts = (propRadius: number): Parts => {
  const plate = platePlan();
  const duct = ductProfile(propRadius + DUCT_CLEARANCE);

  const parts = {
    plate,
    plateEdges: new EdgesGeometry(plate, 30),
    arm: new BoxGeometry(0.0068, 0.0028, 1),
    duct,
    ductEdges: new EdgesGeometry(duct, 40),
    motorBase: new CylinderGeometry(0.0074, 0.0078, 0.0042, 28),
    motorBell: new CylinderGeometry(0.0076, 0.0076, 0.0052, 28),
    motorRing: new CylinderGeometry(0.0079, 0.0079, 0.0009, 28),
    hub: new CylinderGeometry(0.0034, 0.0042, 0.0034, 18),
    blade: bladeGeometry(propRadius),
    disc: new CircleGeometry(propRadius - 0.0005, 48),
    unitBox: new BoxGeometry(1, 1, 1),
    lens: new CylinderGeometry(0.0042, 0.0046, 0.006, 24),
    antenna: new CylinderGeometry(0.00045, 0.00045, 0.03, 6),
    led: new SphereGeometry(0.0011, 10, 8),
  };

  return { ...parts, all: Object.values(parts) };
};

const componentById = (layout: BoardLayout, id: string) =>
  layout.airframe.components.find((component) => component.id === id);

const scenePosition = (layout: BoardLayout, id: string, fallback: Triple): Triple => {
  const component = componentById(layout, id);

  return component === undefined ? fallback : frdToScene(component.position_m);
};

const sceneSize = (layout: BoardLayout, id: string, fallback: Triple): Triple => {
  const component = componentById(layout, id);

  return component === undefined ? fallback : frdSizeToScene(component.size_m);
};

const hotspotPosition = (layout: BoardLayout, id: string, fallback: Triple): Triple => {
  const hotspot = layout.airframe.hotspots.find((spot) => spot.id === id);

  return hotspot === undefined ? fallback : frdToScene(hotspot.position_m);
};

interface RotorProps {
  readonly rotor: LayoutRotor;
  readonly index: number;
  readonly parts: Parts;
  readonly materials: ReturnType<typeof droneMaterials>;
  readonly sampler: PoseSampler;
  readonly showEdges: boolean;
}

const Rotor = ({ rotor, index, parts, materials, sampler, showEdges }: RotorProps) => {
  const spinner = useRef<Group>(null);
  const disc = useRef<Mesh>(null);
  const angle = useRef(index * 0.7);
  const [x, y, z] = frdToScene(rotor.position_m);
  const direction = rotor.spin === "cw" ? -1 : 1;
  const armLength = Math.hypot(x, z);
  const heading = Math.atan2(x, z);

  useFrame((state, dt) => {
    const pose = sampler.read(state.clock.elapsedTime);
    const rpm = pose?.rpm[index] ?? 0;
    const revPerS = Math.min(rpm / 60, MAX_VISUAL_REV_PER_S);

    angle.current = (angle.current + direction * revPerS * TWO_PI * Math.min(dt, 0.05)) % TWO_PI;

    if (spinner.current !== null) spinner.current.rotation.y = angle.current;

    if (disc.current !== null) {
      const blur = Math.min(rpm / 26_000, 1);

      fade(materials.disc, 0.05 + blur * 0.16);
      show(disc.current, rpm > 500);
    }
  });

  return (
    <group>
      <mesh
        geometry={parts.arm}
        material={materials.frame}
        position={[x / 2, PLATE_Y + 0.0012, z / 2]}
        rotation={[0, heading, 0]}
        scale={[1, 1, armLength]}
      />
      <group position={[x, y, z]}>
        <mesh geometry={parts.duct} material={materials.ducts} position={[0, -0.0015, 0]} />
        {showEdges ? (
          <lineSegments
            geometry={parts.ductEdges}
            material={materials.edges}
            position={[0, -0.0015, 0]}
          />
        ) : null}
        <mesh geometry={parts.motorBase} material={materials.motor} position={[0, -0.0072, 0]} />
        <mesh
          geometry={parts.motorBell}
          material={materials.motorBell}
          position={[0, -0.0026, 0]}
        />
        <mesh geometry={parts.motorRing} material={materials.accent} position={[0, -0.0051, 0]} />
        <group ref={spinner} position={[0, 0.0012, 0]}>
          <mesh geometry={parts.hub} material={materials.motorBell} />
          {[0, 1, 2].map((blade) => (
            <mesh
              key={blade}
              geometry={parts.blade}
              material={materials.blade}
              rotation={[direction * 0.22, (blade * TWO_PI) / 3, 0]}
            />
          ))}
        </group>
        <mesh
          ref={disc}
          geometry={parts.disc}
          material={materials.disc}
          position={[0, 0.0014, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        />
      </group>
    </group>
  );
};

interface DroneModelProps {
  readonly layout: BoardLayout;
  readonly tone: DroneTone;
  readonly sampler: PoseSampler;
}

export const DroneModel = ({ layout, tone, sampler }: DroneModelProps) => {
  const propRadius = layout.airframe.prop_diameter_m / 2;
  const parts = useMemo(() => makeParts(propRadius), [propRadius]);
  const colors = layout.airframe.colors;
  const materials = useMemo(() => droneMaterials(tone, colors), [tone, colors]);

  useEffect(
    () => () => {
      for (const geometry of parts.all) geometry.dispose();
    },
    [parts],
  );

  useEffect(
    () => () => {
      for (const material of materials.all) material.dispose();
    },
    [materials],
  );

  const fc = scenePosition(layout, "fc", [0, -0.001, 0]);
  const fcSize = sceneSize(layout, "fc", [0.0255, 0.004, 0.0255]);
  const battery = scenePosition(layout, "battery", [0, 0.009, 0]);
  const batterySize = sceneSize(layout, "battery", [0.031, 0.012, 0.052]);
  const camera = scenePosition(layout, "camera_vtx", [0, -0.003, -0.02]);
  const cameraSize = sceneSize(layout, "camera_vtx", [0.014, 0.018, 0.014]);
  const receiver = scenePosition(layout, "receiver", [0, -0.003, 0.024]);
  const receiverSize = sceneSize(layout, "receiver", [0.01, 0.003, 0.012]);
  const imu = hotspotPosition(layout, "imu0", [0.002, 0, -0.0014]);
  const baro = hotspotPosition(layout, "baro0", [0.007, 0, 0.006]);
  const board = layout.board;
  const boardY = fc[1];
  const mcu = board.mcu.size_mm;
  const showEdges = tone !== "studio";

  return (
    <group>
      <mesh geometry={parts.plate} material={materials.frame} position={[0, PLATE_Y, 0]} />
      {showEdges ? (
        <lineSegments
          geometry={parts.plateEdges}
          material={materials.edges}
          position={[0, PLATE_Y, 0]}
        />
      ) : null}
      {layout.airframe.rotors.map((rotor, index) => (
        <Rotor
          key={rotor.id}
          rotor={rotor}
          index={index}
          parts={parts}
          materials={materials}
          sampler={sampler}
          showEdges={showEdges}
        />
      ))}
      <group position={[fc[0], boardY, fc[2]]}>
        <mesh
          geometry={parts.unitBox}
          material={materials.pcb}
          scale={[fcSize[0], board.thickness_mm / 1000, fcSize[2]]}
        />
        <mesh
          geometry={parts.unitBox}
          material={materials.chip}
          position={[0, 0.0009, 0]}
          scale={[mcu[1] / 1000, 0.0012, mcu[0] / 1000]}
        />
        <mesh geometry={parts.led} material={materials.accent} position={[-0.01, 0.0008, -0.01]} />
      </group>
      <mesh
        geometry={parts.unitBox}
        material={materials.imu}
        position={[imu[0], boardY + 0.0008, imu[2]]}
        scale={[0.0025, 0.0009, 0.003]}
      />
      <mesh
        geometry={parts.unitBox}
        material={materials.baro}
        position={[baro[0], boardY + 0.0008, baro[2]]}
        scale={[0.002, 0.0008, 0.002]}
      />
      <group position={battery}>
        <mesh geometry={parts.unitBox} material={materials.battery} scale={batterySize} />
        <mesh
          geometry={parts.unitBox}
          material={materials.batteryLabel}
          position={[0, 0, batterySize[2] * 0.18]}
          scale={[batterySize[0] * 1.01, batterySize[1] * 1.01, 0.0035]}
        />
      </group>
      <group position={camera}>
        <mesh geometry={parts.unitBox} material={materials.camera} scale={cameraSize} />
        <mesh
          geometry={parts.lens}
          material={materials.lens}
          position={[0, 0.0015, -cameraSize[2] / 2 - 0.002]}
          rotation={[Math.PI / 2 - 0.26, 0, 0]}
        />
      </group>
      <group position={receiver}>
        <mesh geometry={parts.unitBox} material={materials.receiver} scale={receiverSize} />
        <mesh
          geometry={parts.antenna}
          material={materials.antenna}
          position={[0.004, 0.006, 0.012]}
          rotation={[0.9, 0, 0.35]}
        />
        <mesh
          geometry={parts.antenna}
          material={materials.antenna}
          position={[-0.004, 0.006, 0.012]}
          rotation={[0.9, 0, -0.35]}
        />
      </group>
      <mesh
        geometry={parts.unitBox}
        material={materials.noseLight}
        position={[0, PLATE_Y + 0.0016, -PLATE_HALF - 0.0004]}
        scale={[0.012, 0.0012, 0.0012]}
      />
      <mesh
        geometry={parts.unitBox}
        material={materials.tailLight}
        position={[0, PLATE_Y + 0.0016, PLATE_HALF + 0.0004]}
        scale={[0.008, 0.0012, 0.0012]}
      />
    </group>
  );
};
