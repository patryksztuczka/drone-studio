import { boardLayout, connectionState, ConnectionState, runs } from "@drone-studio/engine-client";
import type { AirframeId } from "@drone-studio/engine-client";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from "@drone-studio/ui/components/menu";
import { Dot, pillVariants } from "@drone-studio/ui/components/pill";
import { cn } from "@drone-studio/ui/lib/utils";
import { useAtom, useAtomValue } from "@effect/atom-react";
import { Option } from "effect";
import { AsyncResult } from "effect/reactivity";
import type { ComponentType, ReactNode, SVGProps } from "react";

import { fixed } from "../../../shared/format.ts";
import {
  ChevronIcon,
  EmulationIcon,
  HardwareIcon,
  PauseIcon,
  PlayIcon,
  RunsIcon,
  ShowcaseIcon,
  StudioMark,
  WorkbenchIcon,
} from "../../../shared/icons.tsx";
import {
  activeFlight,
  airframes,
  currentAirframe,
  MANUAL_SCENARIO,
  scenarios,
  selectedAirframe,
  selectedScenario,
  showcase,
  studioMode,
  studioModule,
} from "../../../shared/studio.atoms.ts";
import type { StudioMode, StudioModule } from "../../../shared/studio.atoms.ts";
import { useTransport } from "../../../shared/transport.ts";
import { latestRunFailed } from "../../runs/index.ts";

interface ModuleEntry {
  readonly id: StudioModule;
  readonly name: string;
  readonly description: string;
  readonly key: string;
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const MODULES: ReadonlyArray<ModuleEntry> = [
  {
    id: "workbench",
    name: "Workbench",
    description: "Fly, watch and scrub a flight",
    key: "1",
    icon: WorkbenchIcon,
  },
  {
    id: "hardware",
    name: "Hardware",
    description: "Board, sensors and parts",
    key: "2",
    icon: HardwareIcon,
  },
  {
    id: "runs",
    name: "Runs",
    description: "Every recorded flight, compare two",
    key: "3",
    icon: RunsIcon,
  },
  {
    id: "emulation",
    name: "Emulation",
    description: "Real firmware in Renode",
    key: "4",
    icon: EmulationIcon,
  },
];

const Slash = () => (
  <span aria-hidden="true" className="text-[16px] leading-5 text-faint">
    /
  </span>
);

const crumbClass =
  "flex cursor-pointer items-center gap-1.5 rounded-sm text-[15px] leading-[18px] outline-none focus-visible:ring-2 focus-visible:ring-blue/30";

const ModuleMenu = () => {
  const [module, setModule] = useAtom(studioModule);
  const [, setShowcase] = useAtom(showcase);
  const list = useAtomValue(runs);
  const failing = AsyncResult.isSuccess(list) && latestRunFailed(list.value);
  const current = MODULES.find((entry) => entry.id === module) ?? MODULES[0];

  return (
    <Menu>
      <MenuTrigger
        aria-label={`Module: ${current?.name ?? ""}`}
        className={cn(crumbClass, "font-medium text-ink")}
      >
        {current?.name}
        <ChevronIcon className="text-ink" />
      </MenuTrigger>
      <MenuContent className="w-[340px]" aria-label="Modules">
        <MenuLabel>Modules</MenuLabel>
        {MODULES.map((entry) => {
          const selected = entry.id === module;
          const Icon = entry.icon;

          return (
            <MenuItem
              key={entry.id}
              onSelect={() => setModule(entry.id)}
              className={selected ? "bg-blue-soft data-[highlighted]:bg-blue-soft" : undefined}
            >
              <span className="flex w-5 shrink-0 justify-center">
                <Icon className={selected ? "text-blue" : "text-ink"} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2 text-[14px] leading-[18px] text-ink">
                  {entry.name}
                  {entry.id === "runs" && failing ? (
                    <Dot tone="fail" title="The latest run failed" />
                  ) : null}
                </span>
                <span className="text-[12px] leading-4 text-muted">{entry.description}</span>
              </span>
              <kbd
                className={cn(
                  "w-6 shrink-0 text-right font-label text-[11px] leading-[14px]",
                  selected ? "text-blue" : "text-faint",
                )}
              >
                ⌘{entry.key}
              </kbd>
            </MenuItem>
          );
        })}
        <MenuSeparator />
        <MenuItem onSelect={() => setShowcase(true)}>
          <span className="flex w-5 shrink-0 justify-center">
            <ShowcaseIcon className="text-muted" />
          </span>
          <span className="flex-1 text-[14px] leading-[18px] text-muted">Showcase mode</span>
          <kbd className="w-6 shrink-0 text-right font-label text-[11px] leading-[14px] text-faint">
            F
          </kbd>
        </MenuItem>
      </MenuContent>
    </Menu>
  );
};

const ContextMenu = ({
  label,
  title,
  children,
}: {
  readonly label: string;
  readonly title: string;
  readonly children: ReactNode;
}) => (
  <Menu>
    <MenuTrigger
      aria-label={`${title}: ${label}`}
      className={cn(crumbClass, "max-w-[360px] text-muted")}
    >
      <span className="truncate">{label}</span>
      <ChevronIcon className="shrink-0 text-muted" />
    </MenuTrigger>
    <MenuContent className="max-h-[70vh] w-[320px] overflow-y-auto" aria-label={title}>
      <MenuLabel>{title}</MenuLabel>
      {children}
    </MenuContent>
  </Menu>
);

const ScenarioCrumb = () => {
  const [scenario, setScenario] = useAtom(selectedScenario);
  const known = useAtomValue(scenarios);
  const transport = useTransport();
  const chosen = scenario ?? known[0]?.id;

  const label =
    chosen === MANUAL_SCENARIO
      ? "Manual flight"
      : (known.find((candidate) => candidate.id === chosen)?.name ?? "No scenario");

  return (
    <ContextMenu label={label} title="Scenarios">
      {known.map((candidate) => (
        <MenuItem
          key={candidate.id}
          onSelect={() => setScenario(candidate.id)}
          className={cn(
            "py-2.5",
            candidate.id === chosen ? "bg-blue-soft data-[highlighted]:bg-blue-soft" : undefined,
          )}
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[14px] leading-[18px]">{candidate.name}</span>
            <span className="truncate font-label text-[11px] leading-[14px] text-faint">
              {candidate.id} · {fixed(candidate.duration_s, 0)} s
            </span>
          </span>
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem
        onSelect={() => {
          setScenario(MANUAL_SCENARIO);
          transport.startManual();
        }}
        className="py-2.5"
      >
        <span className="flex flex-col gap-0.5">
          <span className="text-[14px] leading-[18px]">Manual flight</span>
          <span className="font-label text-[11px] leading-[14px] text-faint">
            gamepad or keyboard
          </span>
        </span>
      </MenuItem>
    </ContextMenu>
  );
};

const BoardName = ({ airframe }: { readonly airframe: AirframeId }) => {
  const layout = useAtomValue(boardLayout(airframe));

  return <>{AsyncResult.isSuccess(layout) ? layout.value.board.id : airframe}</>;
};

const HardwareCrumb = () => {
  const airframe = useAtomValue(currentAirframe);
  const known = useAtomValue(airframes);
  const [, setAirframe] = useAtom(selectedAirframe);

  return (
    <Menu>
      <MenuTrigger aria-label="Airframe" className={cn(crumbClass, "text-muted")}>
        {airframe === undefined ? "no airframe" : <BoardName airframe={airframe} />}
        <ChevronIcon className="text-muted" />
      </MenuTrigger>
      <MenuContent className="w-[280px]" aria-label="Airframes">
        <MenuLabel>Airframes</MenuLabel>
        {known.map((id) => (
          <MenuItem
            key={id}
            onSelect={() => setAirframe(id)}
            className={id === airframe ? "bg-blue-soft data-[highlighted]:bg-blue-soft" : undefined}
          >
            <span className="text-[14px] leading-[18px]">{id}</span>
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
};

const PlainCrumb = ({ children }: { readonly children: ReactNode }) => (
  <span className="truncate text-[15px] leading-[18px] text-muted">{children}</span>
);

const RunsCrumb = () => {
  const flight = useAtomValue(activeFlight);

  return (
    <PlainCrumb>
      {Option.match(flight, {
        onNone: () => "No run open",
        onSome: (view) => (view.live ? `${view.label} · live` : view.label),
      })}
    </PlainCrumb>
  );
};

interface EngineView {
  readonly tone: "amber" | "ok" | "fail";
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
      aria-label="Engine"
      title={view.url}
      className="flex items-center gap-1.5 font-label text-[11px] leading-[14px] whitespace-nowrap text-faint"
    >
      <Dot tone={view.tone} />
      {view.text}
    </p>
  );
};

const MODE_TONES = { SIM: "sim", EMU: "emu", REAL: "real" } as const;

const MODE_DOTS = { SIM: "blue", EMU: "amber", REAL: "ok" } as const;

const ModePill = () => {
  const [module, setModule] = useAtom(studioModule);
  const [mode, setMode] = useAtom(studioMode);
  const shown: StudioMode = module === "emulation" ? "EMU" : mode === "REAL" ? "REAL" : "SIM";

  const choose = (next: StudioMode) => {
    setMode(next);

    if (next === "EMU") setModule("emulation");
    else if (module === "emulation") setModule("workbench");
  };

  return (
    <Menu>
      <MenuTrigger
        aria-label={`Target: ${shown}`}
        className={cn(pillVariants({ tone: MODE_TONES[shown], size: "md" }), "cursor-pointer")}
      >
        <Dot tone={MODE_DOTS[shown]} />
        {shown}
      </MenuTrigger>
      <MenuContent align="end" className="w-[260px]" aria-label="Targets">
        <MenuLabel>Target</MenuLabel>
        {(
          [
            ["SIM", "Software in the loop"],
            ["EMU", "Firmware in Renode"],
            ["REAL", "Real board, read-only"],
          ] as const
        ).map(([value, description]) => (
          <MenuItem
            key={value}
            onSelect={() => choose(value)}
            className={value === shown ? "bg-blue-soft data-[highlighted]:bg-blue-soft" : undefined}
          >
            <span className="w-10 font-label text-[12px]">{value}</span>
            <span className="text-[12px] text-muted">{description}</span>
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
};

const CRUMBS: Readonly<Record<StudioModule, ComponentType>> = {
  workbench: ScenarioCrumb,
  hardware: HardwareCrumb,
  runs: RunsCrumb,
  emulation: () => <PlainCrumb>Renode · STM32H743</PlainCrumb>,
};

export const TopBar = () => {
  const module = useAtomValue(studioModule);
  const transport = useTransport();
  const Crumb = CRUMBS[module];

  return (
    <header className="absolute inset-x-10 top-0 z-20 flex h-16 items-center gap-3.5 px-6">
      <StudioMark className="shrink-0" />
      <Slash />
      <ModuleMenu />
      <Slash />
      <Crumb />
      <div className="ml-auto flex shrink-0 items-center gap-3">
        <EngineStatus />
        <ModePill />
        <button
          type="button"
          onClick={transport.toggle}
          aria-label={transport.playing ? "Pause" : "Play"}
          title="Play / Pause (Space)"
          className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-ink text-white outline-none hover:bg-ink-soft focus-visible:ring-2 focus-visible:ring-blue/40"
        >
          {transport.playing ? <PauseIcon /> : <PlayIcon />}
        </button>
      </div>
    </header>
  );
};
