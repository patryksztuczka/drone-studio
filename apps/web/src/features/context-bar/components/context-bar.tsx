import { connectionState, ConnectionState } from "@drone-studio/engine-client";
import { Dot } from "@drone-studio/ui/components/pill";
import { cn } from "@drone-studio/ui/lib/utils";
import { useAtom, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import type { ReactNode } from "react";

import { ChevronIcon, PauseIcon, PlayIcon, ResetIcon, StudioMark } from "../../../shared/icons.tsx";
import { Segmented } from "../../../shared/segmented.tsx";
import {
  airframes,
  currentAirframe,
  MANUAL_SCENARIO,
  scenarios,
  selectedAirframe,
  selectedScenario,
  studioMode,
} from "../../../shared/studio.atoms.ts";
import type { StudioMode } from "../../../shared/studio.atoms.ts";
import { SPEEDS, useTransport } from "../../../shared/transport.ts";

interface EngineView {
  readonly tone: "ok" | "amber" | "fail";
  readonly text: string;
  readonly url: string;
}

const EngineStatus = () => {
  const state = useAtomValue(connectionState);

  const view: EngineView = AsyncResult.isSuccess(state)
    ? ConnectionState.match(state.value, {
        Connecting: (connecting): EngineView => ({
          tone: "amber",
          text: "connecting",
          url: connecting.url,
        }),
        Connected: (connected): EngineView => ({
          tone: "ok",
          text: "engine online",
          url: connected.url,
        }),
        Offline: (offline): EngineView => ({
          tone: "fail",
          text: "engine offline",
          url: offline.url,
        }),
      })
    : { tone: "amber", text: "starting", url: "" };

  return (
    <p
      role="status"
      title={view.url}
      className={cn(
        "flex shrink-0 items-center gap-1.5 font-label text-[11px] leading-[14px] whitespace-nowrap uppercase",
        view.tone === "fail" ? "text-fail" : "text-muted",
      )}
    >
      <Dot tone={view.tone} />
      {view.text}
    </p>
  );
};

interface CrumbProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly className: string;
  readonly children: ReactNode;
}

const Crumb = ({ label, value, onChange, className, children }: CrumbProps) => (
  <label className="relative flex min-w-0 items-center gap-1.5">
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "max-w-[260px] min-w-0 cursor-pointer appearance-none truncate bg-transparent pr-4 outline-none [field-sizing:content]",
        className,
      )}
    >
      {children}
    </select>
    <ChevronIcon className="pointer-events-none absolute right-0" />
  </label>
);

const Slash = () => (
  <span aria-hidden="true" className="text-[15px] leading-[18px] text-faint">
    /
  </span>
);

const MODES: ReadonlyArray<{
  readonly value: StudioMode;
  readonly title: string;
  readonly selectedClassName: string;
}> = [
  { value: "SIM", title: "Software in the loop", selectedClassName: "bg-blue text-white" },
  { value: "EMU", title: "Renode emulation status", selectedClassName: "bg-amber text-white" },
  { value: "REAL", title: "Real hardware (read-only)", selectedClassName: "bg-ok text-white" },
];

export const ContextBar = () => {
  const [mode, setMode] = useAtom(studioMode);
  const [scenario, setScenario] = useAtom(selectedScenario);
  const [, setAirframe] = useAtom(selectedAirframe);
  const airframe = useAtomValue(currentAirframe);
  const knownAirframes = useAtomValue(airframes);
  const knownScenarios = useAtomValue(scenarios);
  const transport = useTransport();
  const chosenScenario = scenario ?? knownScenarios[0]?.id ?? "";

  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-background px-5">
      <StudioMark className="shrink-0" />
      <Slash />
      <Crumb
        label="Airframe"
        value={airframe ?? ""}
        onChange={(value) => setAirframe(knownAirframes.find((candidate) => candidate === value))}
        className="font-label text-[13px] leading-4 text-muted"
      >
        {knownAirframes.length === 0 ? <option value="">palm_x4_2in</option> : null}
        {knownAirframes.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </Crumb>
      <Slash />
      <Crumb
        label="Scenario"
        value={chosenScenario}
        onChange={(value) =>
          setScenario(
            value === MANUAL_SCENARIO
              ? MANUAL_SCENARIO
              : knownScenarios.find((candidate) => candidate.id === value)?.id,
          )
        }
        className="text-[14px] leading-[18px] font-medium text-ink"
      >
        {knownScenarios.length === 0 ? <option value="">No scenario</option> : null}
        {knownScenarios.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.name}
          </option>
        ))}
        <option value={MANUAL_SCENARIO}>Manual flight (gamepad)</option>
      </Crumb>
      <div className="ml-auto flex shrink-0 items-center gap-2.5">
        <EngineStatus />
        <span aria-hidden="true" className="h-5 w-px bg-line" />
        <Segmented<StudioMode>
          label="Target"
          value={mode}
          mono
          onChange={setMode}
          options={MODES.map((option) => ({ ...option, label: option.value }))}
        />
        <label className="relative flex items-center rounded-full border border-line-strong bg-surface">
          <select
            aria-label="Speed"
            value={String(transport.speed)}
            onChange={(event) => transport.setSpeed(Number(event.target.value))}
            className="cursor-pointer appearance-none bg-transparent py-1.5 pr-6 pl-2.5 font-label text-[11px] leading-[14px] text-ink outline-none [field-sizing:content]"
          >
            {SPEEDS.map((speed) => (
              <option key={speed} value={String(speed)}>
                {String(speed)}×
              </option>
            ))}
          </select>
          <ChevronIcon className="pointer-events-none absolute right-2.5 size-[9px] text-muted" />
        </label>
        <button
          type="button"
          onClick={transport.reset}
          aria-label="Reset"
          title="Reset (R)"
          className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-line-strong bg-surface text-ink hover:border-ink"
        >
          <ResetIcon />
        </button>
        <button
          type="button"
          onClick={transport.toggle}
          aria-label={transport.playing ? "Pause" : "Play"}
          title="Play / Pause (Space)"
          className="flex h-8 cursor-pointer items-center gap-2 rounded-full bg-ink pr-3.5 pl-3 text-[13px] leading-4 text-white hover:bg-ink-soft"
        >
          {transport.playing ? <PauseIcon /> : <PlayIcon />}
          {transport.playing ? "Pause" : "Play"}
          <kbd className="font-label text-[10px] leading-3 text-faint">␣</kbd>
        </button>
      </div>
    </header>
  );
};
