import { runs } from "@drone-studio/engine-client";
import type { RunSummary } from "@drone-studio/engine-client";
import { cn } from "@drone-studio/ui/lib/utils";
import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { Option } from "effect";
import { AsyncResult } from "effect/reactivity";
import { useContext } from "react";

import { fixed } from "../../../shared/format.ts";
import { GhostIcon } from "../../../shared/icons.tsx";
import {
  cursor,
  followLive,
  ghostRun,
  PlaybackSource,
  playbackSource,
  replayPlaying,
} from "../../../shared/studio.atoms.ts";
import { failedAssertions, paramSummary, runDay, runTime } from "../run-labels.ts";

const SOURCE_TONES: ReadonlyMap<string, string> = new Map([
  ["mcp", "#a78bfa"],
  ["suite", "#22d3ee"],
  ["cli", "#7b8698"],
  ["studio", "#10b981"],
]);

interface MetricProps {
  readonly label: string;
  readonly value: string;
}

const Metric = ({ label, value }: MetricProps) => (
  <span className="flex flex-col">
    <span className="text-[8.5px] tracking-[0.14em] text-faint">{label}</span>
    <span className="font-mono text-[11px] text-foreground tabular-nums">{value}</span>
  </span>
);

interface RunRowProps {
  readonly run: RunSummary;
  readonly open: boolean;
  readonly ghost: boolean;
}

const RunRow = ({ run, open, ghost }: RunRowProps) => {
  const registry = useContext(RegistryContext);
  const passed = run.result === "PASS";
  const failures = failedAssertions(run);
  const params = paramSummary(run);

  const openRun = () => {
    registry.set(playbackSource, PlaybackSource.cases.Run.make({ runId: run.run_id }));
    registry.set(followLive, false);
    registry.set(cursor, 0);
    registry.set(replayPlaying, true);
  };

  return (
    <li
      className={cn(
        "group relative rounded-lg border bg-[#0d1118] transition-colors",
        open
          ? "border-sim/50 shadow-[0_0_0_1px_#22d3ee22]"
          : "border-hairline hover:border-[#2a3342]",
        ghost ? "border-ghost/50" : undefined,
      )}
    >
      <button
        type="button"
        onClick={openRun}
        className="flex w-full flex-col gap-2 px-3 pt-2.5 pb-2 text-left"
      >
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-[0.1em]",
              passed ? "bg-[#10b9811f] text-real" : "bg-[#f052521f] text-danger",
            )}
          >
            {run.result}
          </span>
          <span className="truncate text-[12.5px] font-medium text-foreground">
            {run.scenario_name}
          </span>
          <span
            className="ml-auto rounded-sm border px-1.5 py-px font-mono text-[9px] tracking-[0.1em] uppercase"
            style={{
              color: SOURCE_TONES.get(run.source) ?? "#7b8698",
              borderColor: `${SOURCE_TONES.get(run.source) ?? "#7b8698"}44`,
            }}
          >
            {run.source}
          </span>
        </span>
        <span className="grid grid-cols-4 gap-2">
          <Metric label="MAX TILT" value={`${fixed(run.metrics.max_tilt_deg, 1)}°`} />
          <Metric label="ATT RMS" value={`${fixed(run.metrics.attitude_error_rms_deg, 2)}°`} />
          <Metric label="MIN PACK" value={`${fixed(run.metrics.min_battery_v, 2)} V`} />
          <Metric label="DURATION" value={`${fixed(run.duration_s, 1)} s`} />
        </span>
        <span className="flex items-center gap-2 font-mono text-[9.5px] text-faint">
          <span>
            {runDay(run.created_at)} {runTime(run.created_at)}
          </span>
          <span>seed {String(run.seed)}</span>
          {failures > 0 ? (
            <span className="text-danger">{String(failures)} assertion failed</span>
          ) : null}
          {params === "" ? null : (
            <span className="truncate text-emu" title={params}>
              {params}
            </span>
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={() => registry.set(ghostRun, ghost ? Option.none() : Option.some(run.run_id))}
        aria-pressed={ghost}
        title={ghost ? "Remove the ghost" : "Fly this run as a ghost beside the open one"}
        className={cn(
          "absolute right-2 bottom-2 flex h-6 items-center gap-1 rounded-md border px-2 text-[10px] font-medium transition-opacity",
          ghost
            ? "border-ghost/60 bg-[#a78bfa1f] text-ghost"
            : "border-hairline bg-panel text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-ghost focus-visible:opacity-100",
        )}
      >
        <GhostIcon width={12} height={12} />
        {ghost ? "Ghost on" : "Compare"}
      </button>
    </li>
  );
};

export const RunsFeed = () => {
  const list = useAtomValue(runs);
  const source = useAtomValue(playbackSource);
  const ghost = useAtomValue(ghostRun);

  const openRun = PlaybackSource.match(source, { Live: () => undefined, Run: (run) => run.runId });

  if (!AsyncResult.isSuccess(list)) {
    return <p className="px-1 py-6 text-center font-mono text-[11px] text-faint">Reading runs/…</p>;
  }

  if (list.value.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-[12px] leading-relaxed text-muted-foreground">
        No recorded runs yet. Fly a scenario, or let an agent run the regression suite.
      </p>
    );
  }

  const passed = list.value.filter((run) => run.result === "PASS").length;

  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-2 px-0.5 font-mono text-[10px] text-faint">
        <span className="size-1.5 animate-pulse rounded-full bg-real" />
        live feed · {String(list.value.length)} runs · {String(passed)} pass ·{" "}
        {String(list.value.length - passed)} fail
      </p>
      <ol className="flex flex-col gap-2">
        {list.value.map((run) => (
          <RunRow
            key={run.run_id}
            run={run}
            open={openRun === run.run_id}
            ghost={Option.contains(ghost, run.run_id)}
          />
        ))}
      </ol>
    </div>
  );
};
