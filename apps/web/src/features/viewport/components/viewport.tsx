import { boardLayout } from "@drone-studio/engine-client";
import type { AirframeId, BoardLayout } from "@drone-studio/engine-client";
import { cn } from "@drone-studio/ui/lib/utils";
import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Option } from "effect";
import { AsyncResult } from "effect/reactivity";
import { useContext, useMemo, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import type { Group } from "three";

import { writeText } from "../../../shared/dom.ts";
import { fixed } from "../../../shared/format.ts";
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

const heightOf = (sampler: PoseSampler) => () => {
  const pose = sampler.read(Number.NaN);

  return pose === undefined ? "–" : `${fixed(pose.height, 2)} m`;
};

const bodyIn = (bodies: ReadonlyMap<string, Group>, key: string) => () => bodies.get(key) ?? null;

interface SceneProps {
  readonly layout: BoardLayout;
  readonly slots: TagSlots;
  readonly fps: RefObject<HTMLSpanElement | null>;
  readonly compare: boolean;
}

const Scene = ({ layout, slots, fps, compare }: SceneProps) => {
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
  const comparing = compare && Option.isSome(ghost);

  const anchors = useMemo((): ReadonlyArray<Anchor> => {
    const tags: Array<Anchor> = [];

    if (xray) tags.push(...xrayAnchors(layout, bodyIn(bodies, "active")));

    if (comparing) {
      tags.push(
        {
          id: "candidate",
          object: bodyIn(bodies, "active"),
          local: [0, 0, 0],
          value: heightOf(active),
          pinned: true,
        },
        {
          id: "baseline",
          object: bodyIn(bodies, "ghost"),
          local: [0, 0, 0],
          value: heightOf(ghostly),
          pinned: true,
        },
      );
    }

    return tags;
  }, [xray, comparing, layout, active, ghostly, bodies]);

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
          trailColor="#9a9a9a"
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

interface DroneTagProps {
  readonly id: "candidate" | "baseline";
  readonly slots: TagSlots;
}

const DroneTag = ({ id, slots }: DroneTagProps) => {
  const candidate = id === "candidate";
  const value = useRef<HTMLSpanElement>(null);

  return (
    <div
      ref={(element) => {
        if (element === null) slots.delete(id);
        else slots.set(id, { root: element, value: value.current });
      }}
      className="pointer-events-none absolute top-0 left-0 opacity-0 transition-opacity"
    >
      <span
        className={cn(
          "absolute left-[150px] flex -translate-y-1/2 items-center gap-2 bg-surface px-2.5 py-[5px] font-label text-[12px] leading-4 whitespace-nowrap",
          candidate ? "border border-blue" : "border border-dashed border-line-strong",
        )}
      >
        <span className={candidate ? "text-blue" : "text-faint"}>
          {candidate ? "CANDIDATE" : "BASELINE"}
        </span>
        <span ref={value} className={candidate ? "text-ink" : "text-muted"}>
          –
        </span>
      </span>
    </div>
  );
};

interface ViewportProps {
  readonly compare?: boolean | undefined;
  readonly children?: ReactNode;
}

const layoutFor = (airframe: AirframeId | undefined) =>
  airframe === undefined ? undefined : boardLayout(airframe);

const LoadedViewport = ({
  layout,
  compare = false,
  children,
}: ViewportProps & { readonly layout: BoardLayout }) => {
  const slots = useMemo<TagSlots>(() => new Map(), []);
  const fps = useRef<HTMLSpanElement>(null);
  const mode = useAtomValue(viewMode);
  const cinematic = useAtomValue(showcase);
  const ghost = useAtomValue(ghostFlight);

  return (
    <div className="relative h-full w-full overflow-hidden" data-testid="viewport">
      <Canvas
        orthographic
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        camera={{ zoom: 4000, near: 0.01, far: 60, position: [1.15, 1.16, 1.15] }}
        aria-label={`3D view of ${layout.airframe.name}`}
      >
        <Scene layout={layout} slots={slots} fps={fps} compare={compare} />
      </Canvas>
      {mode === "xray" && !cinematic ? <XrayLabelLayer layout={layout} slots={slots} /> : null}
      {compare && Option.isSome(ghost) ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <DroneTag id="candidate" slots={slots} />
          <DroneTag id="baseline" slots={slots} />
        </div>
      ) : null}
      <span
        ref={fps}
        className="pointer-events-none absolute right-14 bottom-3 font-label text-[10px] text-faint"
      />
      {children}
    </div>
  );
};

export const Viewport = ({ compare, children }: ViewportProps) => {
  const airframe = useAtomValue(currentAirframe);
  const layout = layoutFor(airframe);

  if (layout === undefined) return <ViewportPlaceholder>{children}</ViewportPlaceholder>;

  return (
    <ViewportWithLayout layoutAtom={layout} compare={compare}>
      {children}
    </ViewportWithLayout>
  );
};

const ViewportWithLayout = ({
  layoutAtom,
  compare,
  children,
}: ViewportProps & { readonly layoutAtom: ReturnType<typeof boardLayout> }) => {
  const result = useAtomValue(layoutAtom);

  if (!AsyncResult.isSuccess(result)) return <ViewportPlaceholder>{children}</ViewportPlaceholder>;

  return (
    <LoadedViewport layout={result.value} compare={compare}>
      {children}
    </LoadedViewport>
  );
};

const ViewportPlaceholder = ({ children }: ViewportProps) => (
  <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
    <div className="flex items-center gap-2">
      <span className="size-1.5 animate-pulse rounded-[3px] bg-blue" />
      <p className="font-label text-[12px] text-faint">waiting for drone-engine</p>
    </div>
    {children}
  </div>
);
