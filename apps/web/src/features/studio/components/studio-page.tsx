import { engineFeed } from "@drone-studio/engine-client";
import { DraftingGrid } from "@drone-studio/ui/components/drafting-grid";
import { PillButton } from "@drone-studio/ui/components/pill";
import { useAtom, useAtomMount, useAtomValue } from "@effect/atom-react";
import { useEffect } from "react";

import {
  engineConnected,
  showcase,
  studioMode,
  studioModule,
  telemetryOpen,
  viewportFrames,
} from "../../../shared/studio.atoms.ts";
import { useTransport } from "../../../shared/transport.ts";
import { EmulationModule } from "../../emulation/index.ts";
import { HardwareModule } from "../../hardware/index.ts";
import { StickHud, useManualFlight } from "../../manual-flight/index.ts";
import { RunsModule } from "../../runs/index.ts";
import { TelemetryDrawer } from "../../telemetry/index.ts";
import {
  FirmwareLog,
  TimeMachine,
  usePlaybackClock,
  useStudioFocus,
} from "../../time-machine/index.ts";
import { Viewport } from "../../viewport/index.ts";
import { WorkbenchModule } from "../../workbench/index.ts";
import { RealCard } from "./real-card.tsx";
import { TopBar } from "./top-bar.tsx";
import { useHotkeys } from "./use-hotkeys.ts";

const ShowcaseOverlay = () => {
  const [, setShowcase] = useAtom(showcase);
  const transport = useTransport();

  return (
    <>
      <div className="pointer-events-none absolute bottom-12 left-16 flex flex-col gap-1">
        <span className="font-display text-[44px] leading-[48px] text-ink">palm_x4_2in</span>
        <span className="font-label text-[12px] leading-4 tracking-[0.04em] text-faint uppercase">
          95 mm · 2S · STM32H743 · {transport.live ? "live sitl" : "replay"}
        </span>
      </div>
      <PillButton
        tone="quiet"
        size="md"
        onClick={() => setShowcase(false)}
        className="absolute top-5 right-16"
      >
        LEAVE SHOWCASE
        <kbd className="text-faint">Esc</kbd>
      </PillButton>
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
  const module = useAtomValue(studioModule);
  const mode = useAtomValue(studioMode);
  const charts = useAtomValue(telemetryOpen);
  const transport = useTransport();
  const flying = cinematic || module === "workbench" || module === "runs";

  useAtomMount(engineFeed);
  usePlaybackClock();
  useStudioFocus();
  useManualFlight();
  useHotkeys(transport);
  useReadyFlag();

  return (
    <div className="relative h-svh min-w-[1024px] overflow-hidden bg-background text-ink">
      <DraftingGrid top={64} bottom={160} side={40} />
      {flying ? (
        <main className={cinematic ? "absolute inset-0" : "absolute inset-x-0 top-16 bottom-40"}>
          <Viewport compare={!cinematic && module === "runs"} />
        </main>
      ) : null}
      {cinematic ? null : (
        <>
          {module === "workbench" ? <WorkbenchModule /> : null}
          {module === "workbench" && mode === "REAL" ? (
            <div className="absolute top-[104px] right-[344px]">
              <RealCard />
            </div>
          ) : null}
          {module === "runs" ? <RunsModule /> : null}
          {module === "hardware" ? <HardwareModule /> : null}
          {module === "emulation" ? <EmulationModule /> : null}
          {flying && charts ? <TelemetryDrawer log={<FirmwareLog />} /> : null}
          {flying ? <TimeMachine /> : null}
        </>
      )}
      {cinematic ? <ShowcaseOverlay /> : <TopBar />}
      <StickHud />
    </div>
  );
};
