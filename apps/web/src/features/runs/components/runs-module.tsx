import { runs } from "@drone-studio/engine-client";
import type { RunId, RunSummary } from "@drone-studio/engine-client";
import { Dot } from "@drone-studio/ui/components/pill";
import { CardHeader, SchematicCard } from "@drone-studio/ui/components/schematic-card";
import { cn } from "@drone-studio/ui/lib/utils";
import { RegistryContext, useAtom, useAtomValue } from "@effect/atom-react";
import { Option } from "effect";
import { AsyncResult } from "effect/reactivity";
import { useContext } from "react";

import { fixed } from "../../../shared/format.ts";
import { AgentIcon } from "../../../shared/icons.tsx";
import {
  activeFlight,
  cursor,
  focusNotice,
  followLive,
  ghostFlight,
  ghostRun,
  PlaybackSource,
  playbackSource,
  replayPlaying,
} from "../../../shared/studio.atoms.ts";
import type { FlightView } from "../../../shared/studio.atoms.ts";
import { failedKinds, ghostDiffRows, paramSummary, runClock } from "../run-labels.ts";

interface RunRowProps {
  readonly run: RunSummary;
  readonly open: boolean;
  readonly base: boolean;
}

const RunRow = ({ run, open, base }: RunRowProps) => {
  const registry = useContext(RegistryContext);
  const params = paramSummary(run);

  const openRun = () => {
    registry.set(playbackSource, PlaybackSource.cases.Run.make({ runId: run.run_id }));
    registry.set(followLive, false);
    registry.set(cursor, 0);
    registry.set(replayPlaying, true);

    if (Option.contains(registry.get(ghostRun), run.run_id)) registry.set(ghostRun, Option.none());
  };

  const toggleBase = () => registry.set(ghostRun, base ? Option.none() : Option.some(run.run_id));

  return (
    <li
      className={cn(
        "group relative flex flex-col gap-1.5 border-b border-line px-3.5 last:border-b-0",
        open ? "bg-ink py-3" : "py-[11px] hover:bg-background",
      )}
    >
      <div className="flex items-center gap-2">
        <Dot tone={run.result === "PASS" ? "ok" : "fail"} />
        <button
          type="button"
          onClick={openRun}
          aria-current={open ? "true" : undefined}
          className={cn(
            "min-w-0 flex-1 cursor-pointer truncate text-left font-sans text-[13px] leading-4 after:absolute after:inset-0",
            open ? "text-white" : "text-ink",
          )}
          title={`${run.scenario_name} · ${run.result} · ${run.source} · seed ${String(run.seed)}`}
        >
          {run.scenario_name}
        </button>
        {open ? (
          <span className="text-[11px] leading-[14px] text-faint">{runClock(run.created_at)}</span>
        ) : (
          <button
            type="button"
            onClick={toggleBase}
            aria-pressed={base}
            aria-label={
              base
                ? `Stop comparing with ${run.scenario_name}`
                : `Compare with ${run.scenario_name}`
            }
            className="relative z-10 cursor-pointer text-[11px] leading-[14px]"
          >
            <span className={cn(base ? "text-faint" : "text-faint group-hover:hidden")}>
              {base ? "base" : runClock(run.created_at)}
            </span>
            {base ? null : <span className="hidden text-blue group-hover:inline">compare</span>}
          </button>
        )}
      </div>
      {open ? (
        <p className="truncate pl-3.5 text-[11px] leading-[14px] text-[#bdbdbd]">
          {params === "" ? `${run.source} · seed ${String(run.seed)}` : params.replace(" ", " · ")}
        </p>
      ) : null}
    </li>
  );
};

const RunsCard = ({ list }: { readonly list: ReadonlyArray<RunSummary> }) => {
  const source = useAtomValue(playbackSource);
  const ghost = useAtomValue(ghostRun);
  const openId = PlaybackSource.match(source, { Live: () => undefined, Run: (run) => run.runId });

  return (
    <SchematicCard aria-label="Runs" className="max-h-full min-h-0 w-[272px]">
      <CardHeader title="Runs" aside={`runs/ · ${String(list.length)}`} />
      {list.length === 0 ? (
        <p className="px-3.5 py-3 font-sans text-[13px] leading-[18px] text-muted">
          No recorded runs yet. Fly a scenario, or run `drone sim suite`.
        </p>
      ) : (
        <ol className="min-h-0 overflow-y-auto">
          {list.map((run) => (
            <RunRow
              key={run.run_id}
              run={run}
              open={openId === run.run_id}
              base={Option.contains(ghost, run.run_id)}
            />
          ))}
        </ol>
      )}
    </SchematicCard>
  );
};

const energyOf = (flight: Option.Option<FlightView>) =>
  Option.match(flight, {
    onNone: () => Number.NaN,
    onSome: (view) =>
      view.table.has("bat_mah") ? view.table.sample("bat_mah", view.table.endTime) : Number.NaN,
  });

const GhostDiffCard = ({ list }: { readonly list: ReadonlyArray<RunSummary> }) => {
  const source = useAtomValue(playbackSource);
  const ghost = useAtomValue(ghostRun);
  const flight = useAtomValue(activeFlight);
  const ghostView = useAtomValue(ghostFlight);
  const find = (id: RunId | undefined) => list.find((run) => run.run_id === id);

  const candidate = find(
    PlaybackSource.match(source, { Live: () => undefined, Run: (run) => run.runId }),
  );

  const baseline = find(Option.getOrUndefined(ghost));

  if (candidate === undefined || baseline === undefined) {
    return (
      <SchematicCard aria-label="Ghost Diff" className="w-[240px]">
        <CardHeader title="Ghost diff" aside="no base" />
        <p className="px-3.5 py-3 font-sans text-[13px] leading-[18px] text-muted">
          {candidate === undefined
            ? "Open a run, then press compare on another to fly it as a ghost."
            : "Hover another run and press compare to fly it as the baseline."}
        </p>
      </SchematicCard>
    );
  }

  const rows = ghostDiffRows(candidate, baseline, {
    candidate: energyOf(flight),
    baseline: energyOf(ghostView),
  });

  const failed = failedKinds(candidate);

  return (
    <SchematicCard aria-label="Ghost Diff" className="w-[240px]">
      <CardHeader title="Ghost diff" aside="vs base" />
      <div className="flex flex-col gap-[9px] px-3.5 py-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3">
            <span>{row.label}</span>
            <span className={cn("tabular-nums", row.worse ? "text-fail" : "text-ink")}>
              {fixed(row.candidate, 1)}{" "}
              <span className="text-faint">
                / {fixed(row.baseline, row.unit === "%" ? 0 : 1)} {row.unit}
              </span>
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1.5 border-t border-line px-3.5 py-3">
        <span className="text-[11px] leading-[14px] text-faint">
          {failed.length === 0 ? "ALL ASSERTIONS PASSED" : "FAILED"}
        </span>
        {failed.map((kind) => (
          <span key={kind}>{kind}</span>
        ))}
      </div>
    </SchematicCard>
  );
};

const FocusToast = () => {
  const [notice, setNotice] = useAtom(focusNotice);

  if (Option.isNone(notice)) return null;

  return (
    <p
      key={notice.value.sequence}
      onAnimationEnd={() => setNotice(Option.none())}
      role="status"
      aria-label="Agent focus"
      className="animate-notice absolute bottom-[172px] left-1/2 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-line-strong bg-surface py-[7px] pr-3 pl-2 shadow-toast"
    >
      <span className="flex size-[22px] items-center justify-center rounded-full bg-blue-soft text-blue">
        <AgentIcon />
      </span>
      <span className="font-sans text-[13px] leading-4 text-ink">
        An agent opened this run at {fixed(notice.value.t, 2)} s
      </span>
      <span className="font-label text-[11px] leading-[14px] text-faint">studio_focus</span>
    </p>
  );
};

export const RunsModule = () => {
  const list = useAtomValue(runs);
  const loaded = AsyncResult.isSuccess(list) ? list.value : [];

  return (
    <>
      <div className="absolute top-[104px] bottom-[196px] left-24 flex flex-col">
        {AsyncResult.isSuccess(list) ? (
          <RunsCard list={loaded} />
        ) : (
          <SchematicCard aria-label="Runs" className="w-[272px]">
            <CardHeader title="Runs" aside="runs/" />
            <p className="px-3.5 py-3 text-faint">reading runs/</p>
          </SchematicCard>
        )}
      </div>
      <div className="absolute top-[104px] right-24">
        <GhostDiffCard list={loaded} />
      </div>
      <FocusToast />
    </>
  );
};
