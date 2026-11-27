import { boardLayout, emuStatus, runSmoke, SmokeRun, smokeRun } from "@drone-studio/engine-client";
import type { AirframeId, BoardLayout, EmuStatus } from "@drone-studio/engine-client";
import { Dot } from "@drone-studio/ui/components/pill";
import {
  CardBody,
  CardFooter,
  CardHeader,
  CardRow,
  SchematicCard,
} from "@drone-studio/ui/components/schematic-card";
import { cn } from "@drone-studio/ui/lib/utils";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { Option } from "effect";
import { AsyncResult } from "effect/reactivity";

import { fixed } from "../../../shared/format.ts";
import { PlayIcon } from "../../../shared/icons.tsx";
import { currentAirframe } from "../../../shared/studio.atoms.ts";
import { useElementSize } from "../../../shared/use-element-size.ts";
import type { ElementSize } from "../../../shared/use-element-size.ts";
import { boardFrame, IsoBoard } from "../../hardware/index.ts";
import { smokeSteps, smokeVerdict } from "../smoke-steps.ts";
import type { SmokeStep } from "../smoke-steps.ts";

const UART_LINES = 8;

const UartCard = ({
  status,
  running,
}: {
  readonly status: EmuStatus | undefined;
  readonly running: boolean;
}) => {
  const report = status?.last_smoke ?? null;
  const lines = (report?.uart_log_tail ?? []).slice(-UART_LINES);

  const state = running
    ? { tone: "amber" as const, text: "booting", className: "text-amber" }
    : report === null
      ? { tone: "faint" as const, text: "never run", className: "text-faint" }
      : report.ok
        ? { tone: "amber" as const, text: "booted", className: "text-amber" }
        : { tone: "fail" as const, text: "failed", className: "text-fail" };

  return (
    <SchematicCard aria-label="UART" className="w-[312px]">
      <CardHeader
        title={
          <>
            UART · <span className="normal-case">usart2</span>
          </>
        }
        aside={
          <span className={cn("flex items-center gap-1.5", state.className)}>
            <Dot tone={state.tone} className={running ? "animate-pulse" : undefined} />
            {state.text}
          </span>
        }
      />
      <ol
        aria-label="UART log"
        className="flex flex-col gap-[7px] px-3.5 py-3 text-[11px] leading-[14px]"
      >
        {report?.error === undefined ? null : <li className="text-fail">{report.error}</li>}
        {lines.length === 0 && report?.error === undefined ? (
          <li className="text-faint">
            {running
              ? "building the firmware…"
              : "Run smoke to boot the firmware and read its UART."}
          </li>
        ) : null}
        {lines.map((line, index) => (
          <li
            key={`${String(index)}-${line}`}
            className={cn("truncate", index === lines.length - 1 ? "text-muted" : "text-ink")}
            title={line}
          >
            {line}
          </li>
        ))}
      </ol>
    </SchematicCard>
  );
};

const Check = ({ on, title }: { readonly on: boolean; readonly title: string }) => (
  <span title={title} className="inline-flex">
    <Dot tone={on ? "ok" : "fail"} />
    <span className="sr-only">{on ? "ready" : "missing"}</span>
  </span>
);

const VERDICT_CLASSES = { PASS: "text-ok", FAIL: "text-fail", never: "text-faint" } as const;

const STEP_GLYPHS: Readonly<Record<SmokeStep["state"], string>> = {
  done: "✓",
  failed: "✕",
  planned: "M2",
  running: "·",
  pending: "·",
};

const EnvironmentCard = ({ status }: { readonly status: EmuStatus | undefined }) => {
  const report = status?.last_smoke ?? null;
  const verdict = smokeVerdict(report);

  return (
    <SchematicCard aria-label="Environment" className="w-[224px]">
      <CardHeader title="Environment" />
      <CardBody>
        <CardRow label="docker">
          <Check
            on={status?.docker !== null && status !== undefined}
            title={status?.docker ?? "not found"}
          />
        </CardRow>
        <CardRow label="firmware .elf">
          <Check on={status?.elf_built === true} title={report?.elf ?? "not built yet"} />
        </CardRow>
        <CardRow label="platform .repl">
          <Check on={status?.repl === true} title="emu/generated" />
        </CardRow>
        <CardRow label="IMU model">
          <span className="text-muted">Icm42688p.cs</span>
        </CardRow>
      </CardBody>
      <CardFooter>
        <span className="text-muted">last smoke</span>
        <span className={VERDICT_CLASSES[verdict]}>
          {verdict}
          {report?.duration_s === undefined ? null : (
            <span className="ml-1.5 text-faint">{fixed(report.duration_s, 1)} s</span>
          )}
        </span>
      </CardFooter>
    </SchematicCard>
  );
};

const STEP_GAP = 194;

const StepNode = ({
  step,
  emphasised,
}: {
  readonly step: SmokeStep;
  readonly emphasised: boolean;
}) => {
  const dashed = step.state === "pending" || step.state === "planned";

  return (
    <span
      aria-label={`${step.label}: ${step.state}`}
      role="img"
      className={cn(
        "flex size-11 items-center justify-center rounded-full font-label text-[11px] leading-[14px]",
        dashed ? "border border-dashed border-line-strong bg-surface text-faint" : "border-[1.5px]",
        step.state === "done" && !emphasised ? "border-amber bg-surface text-amber" : undefined,
        step.state === "done" && emphasised ? "border-amber bg-amber text-white" : undefined,
        step.state === "failed" ? "border-fail bg-surface text-fail" : undefined,
        step.state === "running"
          ? "animate-pulse border-amber bg-amber-soft text-amber"
          : undefined,
      )}
    >
      {STEP_GLYPHS[step.state]}
    </span>
  );
};

const Pipeline = ({
  status,
  running,
}: {
  readonly status: EmuStatus | undefined;
  readonly running: boolean;
}) => {
  const start = useAtomSet(runSmoke);
  const steps = smokeSteps(status, running);
  const lastDone = steps.findLastIndex((step) => step.state === "done");
  const tests = status?.last_smoke?.tests?.length ?? 3;
  const dockerMissing = status !== undefined && status.docker === null;
  const reach = 22 + Math.max(lastDone, 0) * STEP_GAP;
  const width = 22 + (steps.length - 1) * STEP_GAP + 22;

  return (
    <footer
      aria-label="Smoke test"
      className="absolute inset-x-16 bottom-0 flex h-40 items-center gap-10"
    >
      <div className="flex w-[220px] shrink-0 flex-col gap-1">
        <p className="text-[15px] leading-[18px] text-ink">Smoke test</p>
        <p className="font-label text-[12px] leading-4 whitespace-pre text-faint">
          drone emu smoke · {String(tests)} tests
        </p>
      </div>
      <ol className="relative h-[72px] min-w-0 flex-1">
        <svg width={width} height={72} className="absolute top-0 left-0" aria-hidden="true">
          <path d={`M22 22H${String(width - 22)}`} stroke="#e58a0080" strokeDasharray="3 4" />
          {lastDone >= 1 ? (
            <path d={`M22 22H${String(reach)}`} stroke="#e58a00" strokeWidth={1.5} />
          ) : null}
        </svg>
        {steps.map((step, index) => (
          <li
            key={step.label}
            className="absolute top-0 flex w-11 flex-col items-center gap-1.5"
            style={{ left: index * STEP_GAP }}
          >
            <StepNode step={step} emphasised={index === lastDone} />
            <span
              className={cn(
                "font-label text-[11px] leading-[14px] whitespace-pre",
                step.state === "planned" || step.state === "pending"
                  ? "text-faint"
                  : index === lastDone
                    ? "text-ink"
                    : "text-muted",
              )}
            >
              {step.label}
            </span>
          </li>
        ))}
      </ol>
      <button
        type="button"
        disabled={running || dockerMissing}
        onClick={() => start()}
        title={dockerMissing ? "Docker is not running" : "Build the firmware and boot it in Renode"}
        className="flex shrink-0 cursor-pointer items-center gap-2 rounded-full bg-ink px-[18px] py-2.5 text-[13px] leading-4 text-white transition-opacity disabled:cursor-default disabled:opacity-40"
      >
        <PlayIcon className="text-white" />
        {running ? "Running…" : "Run smoke"}
      </button>
    </footer>
  );
};

const Board = ({ layout, size }: { readonly layout: BoardLayout; readonly size: ElementSize }) => (
  <svg width={size.width} height={size.height} className="absolute inset-0" aria-hidden="true">
    <IsoBoard board={layout.board} frame={boardFrame(layout.board, size)} tone="amber" />
  </svg>
);

const EmulationBoard = ({ size }: { readonly size: ElementSize }) => {
  const airframe = useAtomValue(currentAirframe);

  if (airframe === undefined) return null;

  return <BoardFor airframe={airframe} size={size} />;
};

const BoardFor = ({
  airframe,
  size,
}: {
  readonly airframe: AirframeId;
  readonly size: ElementSize;
}) => {
  const layout = useAtomValue(boardLayout(airframe));

  return AsyncResult.isSuccess(layout) ? <Board layout={layout.value} size={size} /> : null;
};

export const EmulationModule = () => {
  const status = useAtomValue(emuStatus);
  const run = useAtomValue(smokeRun);
  const { element, size } = useElementSize<HTMLDivElement>();
  const running = Option.match(run, { onNone: () => false, onSome: SmokeRun.guards.Running });
  const current = AsyncResult.isSuccess(status) ? status.value : undefined;

  return (
    <section ref={element} aria-label="Emulation" className="absolute inset-0">
      {size.width === 0 ? null : <EmulationBoard size={size} />}
      <div className="absolute top-[104px] left-24">
        <UartCard status={current} running={running} />
      </div>
      <div className="absolute top-[104px] right-24">
        <EnvironmentCard status={current} />
      </div>
      <Pipeline status={current} running={running} />
    </section>
  );
};
