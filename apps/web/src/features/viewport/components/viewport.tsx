import { boardLayout, connectionState, ConnectionState } from "@drone-studio/engine-client";
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
import { AnchorTracker } from "./anchor-tags.tsx";
import type { Anchor, TagSlots } from "./anchor-tags.tsx";
import { CameraRig } from "./camera-rig.tsx";
import { FlightRig } from "./flight-rig.tsx";
import { GroundGrid } from "./ground-grid.tsx";
import { SceneEnvironment } from "./scene-environment.tsx";
import { ViewportFooter } from "./viewport-footer.tsx";
import { WindField } from "./wind-field.tsx";
import { XrayLabelLayer, xrayAnchors } from "./xray-labels.tsx";

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
        writeText(fps.current, `${String(Math.round(meterCount.current / elapsed))} fps`);
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

const bodyIn = (bodies: ReadonlyMap<string, Group>, key: string) => () => bodies.get(key) ?? null;

interface SceneProps {
  readonly layout: BoardLayout;
  readonly slots: TagSlots;
  readonly fps: RefObject<HTMLSpanElement | null>;
}

const Scene = ({ layout, slots, fps }: SceneProps) => {
  const registry = useContext(RegistryContext);
  const mode = useAtomValue(viewMode);
  const camera = useAtomValue(cameraMode);
  const cinematic = useAtomValue(showcase);
  const ghost = useAtomValue(ghostFlight);
  const bodies = useMemo(() => new Map<string, Group>(), []);

  const keep = (key: string) => (group: Group | null) => {
    if (group === null) bodies.delete(key);
    else bodies.set(key, group);
  };

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

  const xray = mode === "xray" && !cinematic;
  const comparing = Option.isSome(ghost) && !cinematic;

  const anchors = useMemo(
    (): ReadonlyArray<Anchor> =>
      xray ? xrayAnchors(layout, bodyIn(bodies, "active"), active) : [],
    [xray, layout, active, bodies],
  );

  return (
    <>
      <SceneEnvironment />
      <GroundGrid />
      <FlightRig
        layout={layout}
        sampler={active}
        tone={xray ? "xray" : "studio"}
        showTarget={xray}
        trailColor="#0a6cff"
        onBody={keep("active")}
      />
      {Option.isSome(ghost) && !cinematic ? (
        <FlightRig
          layout={layout}
          sampler={ghostly}
          tone="ghost"
          showTarget={false}
          trailColor="#7c5cff"
          onBody={keep("ghost")}
        />
      ) : null}
      <WindField sampler={active} />
      <CameraRig
        samplers={comparing ? [active, ghostly] : [active]}
        follow={camera === "follow"}
        framing={comparing}
        cinematic={cinematic}
      />
      {anchors.length > 0 ? <AnchorTracker anchors={anchors} slots={slots} /> : null}
      <FrameCounter fps={fps} onReady={() => registry.set(viewportFrames, READY_AFTER_FRAMES)} />
    </>
  );
};

interface ViewportProps {
  readonly overlay?: ReactNode;
  readonly footerAction?: ReactNode;
  readonly showFooter?: boolean;
}

const layoutFor = (airframe: AirframeId | undefined) =>
  airframe === undefined ? undefined : boardLayout(airframe);

const LoadedViewport = ({
  layout,
  overlay,
  footerAction,
  showFooter = true,
}: ViewportProps & { readonly layout: BoardLayout }) => {
  const slots = useMemo<TagSlots>(() => new Map(), []);
  const fps = useRef<HTMLSpanElement>(null);
  const mode = useAtomValue(viewMode);
  const cinematic = useAtomValue(showcase);

  return (
    <div className="relative h-full w-full overflow-hidden" data-testid="viewport">
      <Canvas
        orthographic
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        camera={{ zoom: 4000, near: 0.01, far: 60, position: [1.15, 1.16, 1.15] }}
        aria-label={`3D view of ${layout.airframe.name}`}
      >
        <Scene layout={layout} slots={slots} fps={fps} />
      </Canvas>
      {mode === "xray" && !cinematic ? <XrayLabelLayer layout={layout} slots={slots} /> : null}
      {overlay}
      {showFooter ? (
        <ViewportFooter fps={fps} action={footerAction} />
      ) : (
        <span ref={fps} className="hidden" />
      )}
    </div>
  );
};

export const Viewport = (props: ViewportProps) => {
  const airframe = useAtomValue(currentAirframe);
  const layout = layoutFor(airframe);

  if (layout === undefined) return <ViewportPlaceholder overlay={props.overlay} />;

  return <ViewportWithLayout layoutAtom={layout} {...props} />;
};

const ViewportWithLayout = ({
  layoutAtom,
  ...props
}: ViewportProps & { readonly layoutAtom: ReturnType<typeof boardLayout> }) => {
  const result = useAtomValue(layoutAtom);

  if (!AsyncResult.isSuccess(result)) return <ViewportPlaceholder overlay={props.overlay} />;

  return <LoadedViewport layout={result.value} {...props} />;
};

const ViewportPlaceholder = ({ overlay }: { readonly overlay?: ReactNode }) => {
  const state = useAtomValue(connectionState);

  const url = AsyncResult.isSuccess(state)
    ? ConnectionState.match(state.value, {
        Connecting: (connecting) => connecting.url,
        Connected: (connected) => connected.url,
        Offline: (offline) => offline.url,
      })
    : "";

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
      <div className="flex w-[400px] flex-col items-center gap-3 text-center">
        <span className="size-3 animate-pulse rounded-full bg-blue shadow-[0_0_0_8px_#0a6cff1f]" />
        <p className="text-[16px] leading-5 text-ink">Waiting for drone-engine</p>
        <p className="font-label text-[11px] leading-[14px] text-faint">
          {url === "" ? "starting" : `${url} · retrying every 1 s`}
        </p>
      </div>
      {overlay}
    </div>
  );
};
