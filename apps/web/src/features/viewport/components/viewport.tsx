import { boardLayout } from "@drone-studio/engine-client";
import type { AirframeId, BoardLayout } from "@drone-studio/engine-client";
import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Option } from "effect";
import { AsyncResult } from "effect/reactivity";
import { useContext, useMemo, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import type { Group } from "three";

import { writeText } from "../../../shared/dom.ts";
import {
  activeFlight,
  cameraMode,
  currentAirframe,
  ghostFlight,
  playhead,
  showcase,
  viewMode,
  viewportFrames,
} from "../../../shared/studio.atoms.ts";
import type { FlightView } from "../../../shared/studio.atoms.ts";
import { IDLE_POSE } from "../flight-pose.ts";
import { PoseSampler } from "../pose-sampler.ts";
import { CameraRig } from "./camera-rig.tsx";
import { FlightHud } from "./flight-hud.tsx";
import { FlightRig } from "./flight-rig.tsx";
import { GroundGrid } from "./ground-grid.tsx";
import { SceneEnvironment } from "./scene-environment.tsx";
import { ViewControls } from "./view-controls.tsx";
import { WindField } from "./wind-field.tsx";
import { XrayLabelLayer, XrayLabelTracker } from "./xray-labels.tsx";
import type { LabelSlots } from "./xray-labels.tsx";

const READY_AFTER_FRAMES = 30;

interface FrameCounterProps {
  readonly onReady: () => void;
  readonly fps: RefObject<HTMLSpanElement | null>;
}

const FrameCounter = ({ onReady, fps }: FrameCounterProps) => {
  const frames = useRef(0);
  const meterStart = useRef(0);
  const meterCount = useRef(0);

  useFrame((state) => {
    frames.current += 1;
    meterCount.current += 1;

    if (frames.current === READY_AFTER_FRAMES) onReady();

    const now = state.clock.elapsedTime;
    const elapsed = now - meterStart.current;

    if (elapsed >= 0.5) {
      if (fps.current !== null) {
        writeText(fps.current, `${String(Math.round(meterCount.current / elapsed))} FPS`);
      }

      meterStart.current = now;
      meterCount.current = 0;
    }
  });

  return null;
};

const sourceOf = (flight: Option.Option<FlightView>, t: number) =>
  Option.match(flight, {
    onNone: () => undefined,
    onSome: (view) => ({ table: view.table, t }),
  });

interface SceneProps {
  readonly layout: BoardLayout;
  readonly slots: LabelSlots;
  readonly fps: RefObject<HTMLSpanElement | null>;
}

const Scene = ({ layout, slots, fps }: SceneProps) => {
  const registry = useContext(RegistryContext);
  const mode = useAtomValue(viewMode);
  const camera = useAtomValue(cameraMode);
  const cinematic = useAtomValue(showcase);
  const ghost = useAtomValue(ghostFlight);
  const body = useRef<Group | null>(null);

  const active = useMemo(
    () =>
      new PoseSampler(
        () => sourceOf(registry.get(activeFlight), registry.get(playhead)),
        IDLE_POSE,
      ),
    [registry],
  );

  const ghostly = useMemo(
    () =>
      new PoseSampler(() => sourceOf(registry.get(ghostFlight), registry.get(playhead)), undefined),
    [registry],
  );

  const xray = mode === "xray";

  return (
    <>
      <SceneEnvironment />
      <GroundGrid />
      <FlightRig
        layout={layout}
        sampler={active}
        tone={xray ? "xray" : "studio"}
        showTarget={xray}
        trailColor="#22d3ee"
        onBody={(group) => {
          body.current = group;
        }}
      />
      {Option.isSome(ghost) ? (
        <FlightRig
          layout={layout}
          sampler={ghostly}
          tone="ghost"
          showTarget={false}
          trailColor="#a78bfa"
        />
      ) : null}
      <WindField sampler={active} />
      <CameraRig sampler={active} follow={camera === "follow"} cinematic={cinematic} />
      {xray ? <XrayLabelTracker layout={layout} slots={slots} body={() => body.current} /> : null}
      <FrameCounter fps={fps} onReady={() => registry.set(viewportFrames, READY_AFTER_FRAMES)} />
    </>
  );
};

interface ViewportProps {
  readonly children?: ReactNode;
}

const layoutFor = (airframe: AirframeId | undefined) =>
  airframe === undefined ? undefined : boardLayout(airframe);

const LoadedViewport = ({ layout, children }: ViewportProps & { readonly layout: BoardLayout }) => {
  const slots = useMemo<LabelSlots>(() => new Map(), []);
  const fps = useRef<HTMLSpanElement>(null);
  const mode = useAtomValue(viewMode);
  const cinematic = useAtomValue(showcase);

  return (
    <div className="relative h-full w-full overflow-hidden" data-testid="viewport">
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: 36, near: 0.004, far: 400, position: [0.26, 0.17, 0.32] }}
        aria-label={`3D view of ${layout.airframe.name}`}
      >
        <Scene layout={layout} slots={slots} fps={fps} />
      </Canvas>
      {mode === "xray" ? <XrayLabelLayer layout={layout} slots={slots} /> : null}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,#0b0e14aa_100%)]" />
      <FlightHud />
      {cinematic ? null : <ViewControls />}
      <span
        ref={fps}
        className="pointer-events-none absolute right-3 bottom-2 font-mono text-[10px] text-faint"
      />
      {children}
    </div>
  );
};

export const Viewport = ({ children }: ViewportProps) => {
  const airframe = useAtomValue(currentAirframe);
  const layout = layoutFor(airframe);

  if (layout === undefined) return <ViewportPlaceholder>{children}</ViewportPlaceholder>;

  return <ViewportWithLayout layoutAtom={layout}>{children}</ViewportWithLayout>;
};

const ViewportWithLayout = ({
  layoutAtom,
  children,
}: ViewportProps & { readonly layoutAtom: ReturnType<typeof boardLayout> }) => {
  const result = useAtomValue(layoutAtom);

  if (!AsyncResult.isSuccess(result)) return <ViewportPlaceholder>{children}</ViewportPlaceholder>;

  return <LoadedViewport layout={result.value}>{children}</LoadedViewport>;
};

const ViewportPlaceholder = ({ children }: ViewportProps) => (
  <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_50%_60%,#121823_0%,#0b0e14_70%)]">
    <div className="flex flex-col items-center gap-2 text-center">
      <span className="size-2 animate-pulse rounded-full bg-sim" />
      <p className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
        Waiting for drone-engine
      </p>
    </div>
    {children}
  </div>
);
