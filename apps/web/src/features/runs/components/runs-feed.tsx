import { runs } from "@drone-studio/engine-client";
import type { RunSummary } from "@drone-studio/engine-client";
import { Dot } from "@drone-studio/ui/components/pill";
import { cn } from "@drone-studio/ui/lib/utils";
import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { Option } from "effect";
import { AsyncResult } from "effect/reactivity";
import { useContext, useEffect } from "react";

import { fixed } from "../../../shared/format.ts";
import {
  cursor,
  engineConnected,
  followLive,
  ghostRun,
  PlaybackSource,
  playbackSource,
  replayPlaying,
  runsSeenAt,
} from "../../../shared/studio.atoms.ts";
import { failedAssertions, paramSummary, runDay, runTime } from "../run-labels.ts";

const SOURCE_CLASSES: ReadonlyMap<string, string> = new Map([
  ["mcp", "border-ghost text-ghost"],
  ["suite", "border-gust text-gust"],
  ["studio", "border-ok text-ok"],
]);

interface MetricProps {
  readonly label: string;
  readonly value: string;
}

const Metric = ({ label, value }: MetricProps) => (
  <span className="flex flex-1 basis-0 flex-col font-label">
    <span className="text-[9px] leading-3 text-faint">{label}</span>
    <span className="text-[12px] leading-4 text-ink tabular-nums">{value}</span>
  </span>
);

interface RunCardProps {
  readonly run: RunSummary;
  readonly open: boolean;
  readonly ghost: boolean;
}

const RunCard = ({ run, open, ghost }: RunCardProps) => {
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
        "group relative flex flex-col gap-2 bg-surface px-3 py-2.5",
        open ? "border-[1.5px] border-blue" : undefined,
        ghost && !open ? "border-[1.5px] border-ghost" : undefined,
        !open && !ghost ? "border border-line-strong hover:border-ink/40" : undefined,
      )}
    >
      <button
        type="button"
        onClick={openRun}
        aria-current={open ? "true" : undefined}
        className="flex cursor-pointer items-center gap-2 text-left after:absolute after:inset-0"
      >
        <span
          className={cn(
            "px-1.5 py-px font-label text-[10px] leading-3 text-white",
            passed ? "bg-ok" : "bg-fail",
          )}
        >
          {run.result}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] leading-4 text-ink">
          {run.scenario_name}
        </span>
        <span
          className={cn(
            "border px-1.5 py-px font-label text-[10px] leading-3 uppercase",
            SOURCE_CLASSES.get(run.source) ?? "border-line-strong text-muted",
          )}
        >
          {run.source}
        </span>
      </button>
      <span className="flex">
        <Metric label="MAX TILT" value={`${fixed(run.metrics.max_tilt_deg, 1)}°`} />
        <Metric label="ATT RMS" value={`${fixed(run.metrics.attitude_error_rms_deg, 2)}°`} />
        <Metric label="MIN PACK" value={`${fixed(run.metrics.min_battery_v, 2)} V`} />
        <Metric label="DURATION" value={`${fixed(run.duration_s, 1)} s`} />
      </span>
      <span className="flex min-h-[22px] items-center justify-between gap-2">
        <span className="flex min-w-0 flex-wrap gap-x-2 font-label text-[10px] leading-3">
          <span className="text-faint">
            {runDay(run.created_at)} {runTime(run.created_at)} · seed {String(run.seed)}
          </span>
          {failures > 0 ? (
            <span className="text-fail">
              {String(failures)} assertion{failures === 1 ? "" : "s"} failed
            </span>
          ) : null}
          {params === "" ? null : (
            <span className="truncate text-amber" title={params}>
              {params}
            </span>
          )}
        </span>
        {open ? null : (
          <button
            type="button"
            onClick={() => registry.set(ghostRun, ghost ? Option.none() : Option.some(run.run_id))}
            aria-pressed={ghost}
            title={ghost ? "Remove the ghost" : "Fly this run as a ghost beside the open one"}
            className={cn(
              "relative z-10 shrink-0 cursor-pointer rounded-full border px-[9px] py-0.5 text-[11px] leading-[14px]",
              ghost
                ? "border-ghost bg-[#f3f0ff] text-ghost"
                : "border-line-strong text-ink opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            )}
          >
            {ghost ? "Ghost on" : "Compare"}
          </button>
        )}
      </span>
    </li>
  );
};

const useMarkSeen = (newest: string | undefined) => {
  const registry = useContext(RegistryContext);

  useEffect(() => {
    if (newest !== undefined && newest > registry.get(runsSeenAt)) registry.set(runsSeenAt, newest);
  }, [registry, newest]);
};

const EmptyFeed = ({ title, detail }: { readonly title: string; readonly detail: string }) => (
  <div className="mx-5 mt-5 flex flex-col gap-2 border border-dashed border-line-strong p-[18px]">
    <p className="text-[14px] leading-[18px] text-ink">{title}</p>
    <p className="text-[12px] leading-[18px] text-muted">{detail}</p>
    <p className="font-label text-[11px] leading-[14px] text-faint">drone sim suite · sim_suite</p>
  </div>
);

export const RunsFeed = () => {
  const list = useAtomValue(runs);
  const connected = useAtomValue(engineConnected);
  const source = useAtomValue(playbackSource);
  const ghost = useAtomValue(ghostRun);
  const loaded = AsyncResult.isSuccess(list) ? list.value : [];

  useMarkSeen(loaded[0]?.created_at);

  const openRun = PlaybackSource.match(source, { Live: () => undefined, Run: (run) => run.runId });

  if (!AsyncResult.isSuccess(list)) {
    return connected ? (
      <p className="px-5 py-6 font-label text-[11px] text-faint">reading runs/…</p>
    ) : (
      <EmptyFeed title="No runs to show yet." detail="Runs appear once drone-engine connects." />
    );
  }

  if (loaded.length === 0) {
    return (
      <EmptyFeed
        title="No recorded runs yet."
        detail="Fly a scenario, or let an agent run the regression suite."
      />
    );
  }

  const passed = loaded.filter((run) => run.result === "PASS").length;

  return (
    <div className="flex flex-col gap-2.5 px-5 py-3">
      <p className="flex items-center gap-2 font-label text-[11px] leading-[14px] text-muted">
        <Dot tone="ok" />
        live feed · {String(loaded.length)} runs · {String(passed)} pass ·{" "}
        {String(loaded.length - passed)} fail
      </p>
      <ol className="flex flex-col gap-2.5">
        {loaded.map((run) => (
          <RunCard
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
