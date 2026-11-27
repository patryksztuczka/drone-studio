import { engineFeed } from "@drone-studio/engine-client";
import { useAtom, useAtomMount, useAtomValue } from "@effect/atom-react";
import { useEffect } from "react";

import { CloseIcon, DroneMark } from "../../../shared/icons.tsx";
import { engineConnected, showcase, viewportFrames } from "../../../shared/studio.atoms.ts";
import { useTransport } from "../../../shared/transport.ts";
import { ContextBar, TargetPanel } from "../../context-bar/index.ts";
import { StickHud, useManualFlight } from "../../manual-flight/index.ts";
import { TimeMachine, usePlaybackClock, useStudioFocus } from "../../time-machine/index.ts";
import { Viewport } from "../../viewport/index.ts";
import { InspectorPanel } from "./inspector-panel.tsx";
import { useHotkeys } from "./use-hotkeys.ts";

const ShowcaseOverlay = () => {
  const [, setShowcase] = useAtom(showcase);
  const transport = useTransport();

  return (
    <>
      <div className="pointer-events-none absolute right-6 bottom-6 flex flex-col items-end gap-1 text-right">
        <span className="flex items-center gap-2 text-[11px] font-bold tracking-[0.3em] text-foreground/80">
          <DroneMark className="text-sim" />
          DRONE STUDIO
        </span>
        <span className="font-display text-[34px] leading-none text-foreground">palm_x4_2in</span>
        <span className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground">
          95 MM · 2S · STM32H743 · {transport.live ? "LIVE SITL" : "REPLAY"}
        </span>
      </div>
      <button
        type="button"
        onClick={() => setShowcase(false)}
        className="absolute top-3 right-3 flex h-7 items-center gap-1.5 rounded-md border border-hairline bg-[#0b0e14b3] px-2.5 text-[11px] text-muted-foreground backdrop-blur hover:text-foreground"
      >
        <CloseIcon width={13} height={13} />
        Leave showcase
        <kbd className="font-mono text-[9px] text-faint">Esc</kbd>
      </button>
    </>
  );
};

const useReadyFlag = () => {
  const connected = useAtomValue(engineConnected);
  const frames = useAtomValue(viewportFrames);
  const ready = connected && frames > 0;

  useEffect(() => {
    document.documentElement.dataset["studioReady"] = String(ready);
  }, [ready]);
};

export const StudioPage = () => {
  const cinematic = useAtomValue(showcase);
  const transport = useTransport();

  useAtomMount(engineFeed);
  usePlaybackClock();
  useStudioFocus();
  useManualFlight();
  useHotkeys(transport);
  useReadyFlag();

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background text-foreground">
      {cinematic ? null : <ContextBar />}
      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          <Viewport>
            {cinematic ? <ShowcaseOverlay /> : <TargetPanel />}
            <StickHud />
          </Viewport>
        </main>
        {cinematic ? null : <InspectorPanel />}
      </div>
      {cinematic ? null : <TimeMachine />}
    </div>
  );
};
