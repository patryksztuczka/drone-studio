import { connectionState, ConnectionState } from "@drone-studio/engine-client";
import { cn } from "@drone-studio/ui/lib/utils";
import { useAtom, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import type { ReactNode } from "react";

import {
  DroneMark,
  GamepadIcon,
  PauseIcon,
  PlayIcon,
  ResetIcon,
  ShowcaseIcon,
  XrayIcon,
} from "../../../shared/icons.tsx";
import { Segmented } from "../../../shared/segmented.tsx";
import {
  airframes,
  currentAirframe,
  MANUAL_SCENARIO,
  scenarios,
  selectedAirframe,
  selectedScenario,
  showcase,
  studioMode,
  viewMode,
} from "../../../shared/studio.atoms.ts";
import type { StudioMode } from "../../../shared/studio.atoms.ts";
import { SPEEDS, useTransport } from "../../../shared/transport.ts";

const MODE_COLORS = { SIM: "#22d3ee", EMU: "#f5a524", REAL: "#10b981" } as const;

const EngineStatus = () => {
  const state = useAtomValue(connectionState);

  const view = AsyncResult.isSuccess(state)
    ? ConnectionState.match(state.value, {
        Connecting: (connecting) => ({ tone: "#f5a524", text: "connecting", url: connecting.url }),
        Connected: (connected) => ({ tone: "#10b981", text: "engine online", url: connected.url }),
        Offline: (offline) => ({ tone: "#f05252", text: "engine offline", url: offline.url }),
      })
    : { tone: "#f5a524", text: "starting", url: "" };

  return (
    <p
      role="status"
      title={view.url}
      className="flex shrink-0 items-center gap-2 font-mono text-[10px] tracking-[0.12em] whitespace-nowrap text-muted-foreground uppercase"
    >
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full"
        style={{ background: view.tone, boxShadow: `0 0 8px ${view.tone}` }}
      />
      <span className="hidden xl:inline">{view.text}</span>
    </p>
  );
};

interface PickerProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly children: ReactNode;
}

const Picker = ({ label, value, onChange, children }: PickerProps) => (
  <label className="flex h-7 min-w-0 items-center gap-2 rounded-md border border-hairline bg-panel pr-1 pl-2.5">
    <span className="text-[9px] font-semibold tracking-[0.16em] text-faint">{label}</span>
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-6 max-w-[200px] min-w-0 cursor-pointer appearance-none truncate bg-transparent pr-1 font-mono text-[11px] text-foreground outline-none"
    >
      {children}
    </select>
  </label>
);

interface ToggleProps {
  readonly pressed: boolean;
  readonly onClick: () => void;
  readonly label: string;
  readonly shortcut: string;
  readonly tone: string;
  readonly children: ReactNode;
}

const Toggle = ({ pressed, onClick, label, shortcut, tone, children }: ToggleProps) => (
  <button
    type="button"
    aria-pressed={pressed}
    onClick={onClick}
    title={`${label} (${shortcut})`}
    className={cn(
      "flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium whitespace-nowrap transition-colors",
      pressed ? "bg-panel-raised" : "border-hairline text-muted-foreground hover:text-foreground",
    )}
    style={
      pressed
        ? { color: tone, borderColor: `${tone}66`, boxShadow: `0 0 14px ${tone}22` }
        : undefined
    }
  >
    {children}
    {label}
    <kbd className="ml-0.5 hidden font-mono text-[9px] text-faint 2xl:inline">{shortcut}</kbd>
  </button>
);

const speedLabel = (speed: number) => `${String(speed)}×`;

export const ContextBar = () => {
  const [mode, setMode] = useAtom(studioMode);
  const [view, setView] = useAtom(viewMode);
  const [cinematic, setCinematic] = useAtom(showcase);
  const [scenario, setScenario] = useAtom(selectedScenario);
  const [, setAirframe] = useAtom(selectedAirframe);
  const airframe = useAtomValue(currentAirframe);
  const knownAirframes = useAtomValue(airframes);
  const knownScenarios = useAtomValue(scenarios);
  const transport = useTransport();
  const accent = MODE_COLORS[mode];
  const chosenScenario = scenario ?? knownScenarios[0]?.id ?? "";

  return (
    <header
      className="relative flex h-12 shrink-0 items-center gap-3 border-b border-hairline bg-panel px-3"
      style={{ boxShadow: `inset 0 -1px 0 ${accent}33` }}
    >
      <div className="flex shrink-0 items-center gap-2 pr-1">
        <DroneMark style={{ color: accent }} />
        <div className="flex flex-col leading-none">
          <span className="text-[12px] font-bold tracking-[0.2em] whitespace-nowrap text-foreground">
            DRONE STUDIO
          </span>
          <span className="hidden font-mono text-[9px] tracking-[0.1em] whitespace-nowrap text-faint 2xl:block">
            v0.1 · digital twin
          </span>
        </div>
      </div>
      <Segmented<StudioMode>
        label="Target"
        value={mode}
        accent={accent}
        onChange={setMode}
        options={[
          { value: "SIM", label: "SIM", title: "Software in the loop" },
          { value: "EMU", label: "EMU", title: "Renode emulation status" },
          { value: "REAL", label: "REAL", title: "Real hardware (read-only)" },
        ]}
      />
      <span className="h-5 w-px bg-hairline" />
      <Picker
        label="AIRFRAME"
        value={airframe ?? ""}
        onChange={(value) => setAirframe(knownAirframes.find((candidate) => candidate === value))}
      >
        {knownAirframes.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </Picker>
      <Picker
        label="SCENARIO"
        value={chosenScenario}
        onChange={(value) =>
          setScenario(
            value === MANUAL_SCENARIO
              ? MANUAL_SCENARIO
              : knownScenarios.find((candidate) => candidate.id === value)?.id,
          )
        }
      >
        {knownScenarios.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.name}
          </option>
        ))}
        <option value={MANUAL_SCENARIO}>Manual flight (gamepad)</option>
      </Picker>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={transport.toggle}
          aria-label={transport.playing ? "Pause" : "Play"}
          title="Play / Pause (Space)"
          className="flex h-7 items-center gap-1.5 rounded-md px-3 text-[11px] font-semibold text-[#0b0e14] transition-[filter] hover:brightness-110"
          style={{ background: accent }}
        >
          {transport.playing ? (
            <PauseIcon width={14} height={14} />
          ) : (
            <PlayIcon width={14} height={14} />
          )}
          {transport.playing ? "PAUSE" : "PLAY"}
        </button>
        <button
          type="button"
          onClick={transport.reset}
          aria-label="Reset"
          title="Reset (R)"
          className="flex size-7 items-center justify-center rounded-md border border-hairline text-muted-foreground hover:text-foreground"
        >
          <ResetIcon width={14} height={14} />
        </button>
      </div>
      <Segmented
        label="Speed"
        value={String(transport.speed)}
        accent={accent}
        onChange={(value) => transport.setSpeed(Number(value))}
        options={SPEEDS.map((speed) => ({ value: String(speed), label: speedLabel(speed) }))}
      />
      <button
        type="button"
        onClick={transport.startManual}
        title="Fly it yourself with a gamepad or the keyboard"
        className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-hairline px-2.5 text-[11px] font-medium text-muted-foreground hover:border-sim/40 hover:text-sim whitespace-nowrap"
      >
        <GamepadIcon width={15} height={15} />
        Manual flight
      </button>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <EngineStatus />
        <span className="h-5 w-px bg-hairline" />
        <Toggle
          pressed={view === "xray"}
          onClick={() => setView(view === "xray" ? "studio" : "xray")}
          label="X-Ray"
          shortcut="X"
          tone="#22d3ee"
        >
          <XrayIcon width={14} height={14} />
        </Toggle>
        <Toggle
          pressed={cinematic}
          onClick={() => setCinematic(!cinematic)}
          label="Showcase"
          shortcut="F"
          tone="#a78bfa"
        >
          <ShowcaseIcon width={14} height={14} />
        </Toggle>
      </div>
    </header>
  );
};
