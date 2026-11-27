import { engineFeed } from "@drone-studio/engine-client";
import { useAtom, useAtomMount, useAtomValue } from "@effect/atom-react";
import { useEffect } from "react";

import { GamepadIcon } from "../../../shared/icons.tsx";
import {
  engineConnected,
  manualFlightActive,
  showcase,
  viewportFrames,
} from "../../../shared/studio.atoms.ts";
import { useTransport } from "../../../shared/transport.ts";
import { ContextBar, RpcErrorToast, TargetPanel } from "../../context-bar/index.ts";
import { StickHud, useManualFlight } from "../../manual-flight/index.ts";
import {
  FirmwareLog,
  TimeMachine,
  usePlaybackClock,
  useStudioFocus,
} from "../../time-machine/index.ts";
import { FlightHud, ViewControls, Viewport } from "../../viewport/index.ts";
import { InspectorPanel } from "./inspector-panel.tsx";
import { useHotkeys } from "./use-hotkeys.ts";

const ShowcaseOverlay = () => {
  const [, setShowcase] = useAtom(showcase);
  const transport = useTransport();

  return (
    <>
      <button
        type="button"
        onClick={() => setShowcase(false)}
        className="absolute top-10 right-10 z-10 flex cursor-pointer items-center gap-2 rounded-full border border-line-strong bg-surface px-3.5 py-2 text-[13px] leading-4 text-ink hover:border-ink"
      >
        Leave showcase
        <kbd className="font-label text-[10px] leading-3 text-faint">Esc</kbd>
      </button>
      <div className="pointer-events-none absolute right-12 bottom-11 flex flex-col items-end gap-1.5">
        <span className="font-label text-[12px] leading-4 tracking-[0.12em] text-blue">
          DRONE STUDIO
        </span>
        <span className="text-[64px] leading-[64px] font-medium tracking-[-0.04em] text-ink">
          palm_x4_2in
        </span>
        <span className="font-label text-[12px] leading-4 tracking-[0.06em] text-muted">
          95 MM · 2S · STM32H743 · {transport.live ? "LIVE SITL" : "REPLAY"}
        </span>
      </div>
    </>
  );
};

const ManualFlightButton = () => {
  const transport = useTransport();

  return (
    <button
      type="button"
      onClick={transport.startManual}
      title="Fly it yourself with a gamepad or the keyboard"
      className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line-strong bg-surface px-2.5 py-[5px] text-[12px] leading-4 text-ink hover:border-ink"
    >
      <GamepadIcon />
      Manual flight
    </button>
  );
};

const RegistrationMark = ({ className }: { readonly className: string }) => (
  <span
    aria-hidden="true"
    className={`pointer-events-none absolute z-30 size-[7px] rounded-full border border-registration bg-background ${className}`}
  />
);

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
  const manual = useAtomValue(manualFlightActive);
  const transport = useTransport();

  useAtomMount(engineFeed);
  usePlaybackClock();
  useStudioFocus();
  useManualFlight();
  useHotkeys(transport);
  useReadyFlag();

  return (
    <div className="relative flex h-svh min-w-[1100px] flex-col overflow-hidden bg-background text-ink">
      {cinematic ? null : <ContextBar />}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="relative min-h-0 flex-1">
            <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px bg-line-soft" />
            <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px bg-line-soft" />
            <div className="absolute inset-0">
              <Viewport
                footerAction={<ManualFlightButton />}
                showFooter={!cinematic && !manual}
                overlay={
                  <>
                    <FlightHud
                      className={cinematic ? "absolute top-10 left-10" : "absolute top-5 left-5"}
                    />
                    {cinematic ? <ShowcaseOverlay /> : <ViewControls />}
                    {cinematic ? null : <TargetPanel />}
                    <StickHud />
                    <RpcErrorToast />
                  </>
                }
              />
            </div>
          </main>
          {cinematic ? null : (
            <div className="border-t border-line">
              <TimeMachine />
            </div>
          )}
        </div>
        {cinematic ? null : (
          <div className="relative flex w-[410px] shrink-0 flex-col border-l border-line bg-surface">
            <InspectorPanel />
            <div className="border-t border-line">
              <FirmwareLog />
            </div>
            <RegistrationMark className="-top-1 -left-1" />
            <RegistrationMark className="bottom-[171px] -left-1" />
          </div>
        )}
      </div>
    </div>
  );
};
