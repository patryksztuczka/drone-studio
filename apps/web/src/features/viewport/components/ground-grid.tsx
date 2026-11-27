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
uniform vec3 uLine;
uniform vec3 uPad;
uniform vec3 uCentre;
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
  float fade = clamp(1.0 - length(coord - uCentre.xz) / uFade, 0.0, 1.0);
  float fine = gridLine(coord, 0.01, 1.0) * 0.35;
  float decimetre = gridLine(coord, 0.1, 1.0) * 0.8;
  float metre = gridLine(coord, 1.0, 1.2);
  float radius = length(coord);
  float pad = smoothstep(0.0012, 0.0, abs(radius - 0.06)) + smoothstep(0.0008, 0.0, abs(radius - 0.035)) * 0.7;
  float alpha = max(max(fine, decimetre), metre) * 0.3 * fade;
  vec3 color = uLine;
  if (pad * fade > alpha) {
    color = uPad;
    alpha = pad * fade * 0.28;
  }
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
        uLine: { value: [0.72, 0.72, 0.72] },
        uPad: { value: [0.04, 0.42, 1] },
        uCentre: { value: [0, 0, 0] },
        uFade: { value: 0.32 },
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

  return <mesh geometry={parts.geometry} material={parts.material} renderOrder={-1} />;
};
