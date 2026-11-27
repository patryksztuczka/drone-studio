import { useEffect, useMemo } from "react";
import { DoubleSide, PlaneGeometry, ShaderMaterial } from "three";

const vertexShader = `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const fragmentShader = `
uniform vec3 uMinor;
uniform vec3 uMajor;
uniform vec3 uAxis;
uniform vec3 uPad;
uniform float uFade;
varying vec3 vWorld;

float gridLine(vec2 coord, float spacing, float width) {
  vec2 scaled = coord / spacing;
  vec2 derivative = fwidth(scaled);
  vec2 lines = abs(fract(scaled - 0.5) - 0.5) / derivative;
  return 1.0 - min(min(lines.x, lines.y) / width, 1.0);
}

void main() {
  vec2 coord = vWorld.xz;
  float distanceToCamera = length(cameraPosition.xz - coord);
  float fade = clamp(1.0 - distanceToCamera / uFade, 0.0, 1.0);
  float centimetre = gridLine(coord, 0.1, 1.0) * clamp(1.0 - distanceToCamera / 4.0, 0.0, 1.0);
  float metre = gridLine(coord, 1.0, 1.3);
  float decametre = gridLine(coord, 10.0, 1.6);
  vec2 axisDerivative = fwidth(coord);
  float axisX = 1.0 - min(abs(coord.y) / (axisDerivative.y * 1.6), 1.0);
  float axisZ = 1.0 - min(abs(coord.x) / (axisDerivative.x * 1.6), 1.0);
  float radius = length(coord);
  float pad = smoothstep(0.012, 0.0, abs(radius - 0.16)) + smoothstep(0.008, 0.0, abs(radius - 0.08)) * 0.6;
  vec3 color = uMinor * centimetre * 0.55 + uMajor * max(metre, decametre * 1.4);
  color = max(color, uAxis * max(axisX, axisZ) * 0.9);
  color += uPad * pad * 0.8;
  float alpha = max(max(centimetre * 0.5, max(metre, decametre)), max(max(axisX, axisZ), pad)) * fade;
  gl_FragColor = vec4(color, alpha);
}
`;

export const GroundGrid = () => {
  const parts = useMemo(() => {
    const geometry = new PlaneGeometry(400, 400, 1, 1);

    geometry.rotateX(-Math.PI / 2);

    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      extensions: { clipCullDistance: false, multiDraw: false },
      uniforms: {
        uMinor: { value: [0.14, 0.18, 0.24] },
        uMajor: { value: [0.2, 0.27, 0.36] },
        uAxis: { value: [0.13, 0.55, 0.64] },
        uPad: { value: [0.13, 0.83, 0.93] },
        uFade: { value: 26 },
      },
    });

    return { geometry, material };
  }, []);

  useEffect(
    () => () => {
      parts.geometry.dispose();
      parts.material.dispose();
    },
    [parts],
  );

  return (
    <>
      <mesh geometry={parts.geometry} material={parts.material} renderOrder={-1} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
        <circleGeometry args={[60, 64]} />
        <meshStandardMaterial color="#0d1118" roughness={0.95} metalness={0} />
      </mesh>
    </>
  );
};
