import { emuStatus, realStatus, runSmoke, SmokeRun, smokeRun } from "@drone-studio/engine-client";
import type { EmuStatus } from "@drone-studio/engine-client";
import { cn } from "@drone-studio/ui/lib/utils";
import { useAtom, useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react";
import { Option } from "effect";
import { AsyncResult } from "effect/reactivity";
import type { ReactNode } from "react";

import { fixed } from "../../../shared/format.ts";
import { PlayIcon } from "../../../shared/icons.tsx";
import { studioMode } from "../../../shared/studio.atoms.ts";

interface RowProps {
  readonly label: string;
  readonly tone?: "ok" | "fail" | "ink";
  readonly children: ReactNode;
}

const TONE_CLASSES = { ok: "text-ok", fail: "text-fail", ink: "text-ink" } as const;

const Row = ({ label, tone = "ink", children }: RowProps) => (
  <div className="flex items-baseline justify-between gap-6">
    <span className="font-label text-[12px] leading-4 text-muted">{label}</span>
    <span className={cn("text-right font-label text-[12px] leading-4", TONE_CLASSES[tone])}>
      {children}
    </span>
  </div>
);

interface CardProps {
  readonly title: string;
  readonly badge: string;
  readonly tone: "amber" | "ok";
  readonly children: ReactNode;
}

const Card = ({ title, badge, tone, children }: CardProps) => {
  const [, setMode] = useAtom(studioMode);

  return (
    <section
      aria-label={title}
      className={cn(
        "pointer-events-auto absolute top-[72px] right-5 z-10 flex w-[360px] flex-col border bg-surface shadow-[0_14px_40px_#11111114]",
        tone === "amber" ? "border-amber" : "border-ok",
      )}
    >
      <header className="flex items-center gap-2.5 border-b border-line px-3.5 py-3">
        <span
          className={cn(
            "px-[7px] py-0.5 font-label text-[10px] leading-3 whitespace-pre text-white",
            tone === "amber" ? "bg-amber" : "bg-ok",
          )}
        >
          {badge}
        </span>
        <h2 className="flex-1 text-[14px] leading-[18px] font-normal text-ink">{title}</h2>
        <button
          type="button"
          aria-label="Back to SIM"
          onClick={() => setMode("SIM")}
          className="cursor-pointer text-[14px] leading-[18px] text-faint hover:text-ink"
        >
          ×
        </button>
      </header>
      {children}
    </section>
  );
};

const lastSmoke = (status: EmuStatus) => {
  const report = status.last_smoke;

  if (report === null) return { tone: "ink" as const, text: "never" };

  const duration = report.duration_s === undefined ? "" : ` · ${fixed(report.duration_s, 1)} s`;

  return report.ok
    ? { tone: "ok" as const, text: `PASS${duration}` }
    : { tone: "fail" as const, text: `FAIL${duration}` };
};

const EmuCard = () => {
  const status = useAtomValue(emuStatus);
  const refresh = useAtomRefresh(emuStatus);
  const run = useAtomValue(smokeRun);
  const start = useAtomSet(runSmoke);
  const running = Option.match(run, { onNone: () => false, onSome: SmokeRun.guards.Running });
  const value = AsyncResult.isSuccess(status) ? status.value : undefined;
  const smoke = value === undefined ? undefined : lastSmoke(value);
  const failure = value?.last_smoke?.ok === false ? value.last_smoke.error : undefined;

  return (
    <Card tone="amber" title="Renode emulation" badge="EMU">
      <div className="flex flex-col gap-[9px] px-3.5 py-3">
        {value === undefined ? (
          <Row label="drone-engine">asking…</Row>
        ) : (
          <>
            <Row label="Docker" tone={value.docker === null ? "fail" : "ink"}>
              {value.docker ?? "not found"}
            </Row>
            <Row label="Firmware ELF" tone={value.elf_built ? "ok" : "fail"}>
              {value.elf_built ? "built" : "not built"}
            </Row>
            <Row label="Renode platform" tone={value.repl ? "ok" : "fail"}>
              {value.repl ? "generated" : "missing"}
            </Row>
            <Row label="Last smoke test" tone={running ? "ink" : (smoke?.tone ?? "ink")}>
              {running ? "running…" : (smoke?.text ?? "never")}
            </Row>
          </>
        )}
      </div>
      <p
        className={cn(
          "mx-3.5 border px-[11px] py-[9px] text-[12px] leading-[18px]",
          failure === undefined
            ? "border-[#f5d9a8] bg-[#fff8ec] text-[#8a5300]"
            : "border-fail/40 bg-[#fdeeee] text-fail",
        )}
      >
        {failure ??
          "The smoke test builds the STM32H743 firmware and boots it in Renode. The SIM flight keeps running meanwhile."}
      </p>
      <div className="flex gap-2 px-3.5 py-3">
        <button
          type="button"
          onClick={() => start()}
          disabled={running || value?.docker === null}
          className="flex cursor-pointer items-center gap-2 rounded-full bg-ink px-3.5 py-2 text-[12px] leading-4 text-white disabled:cursor-default disabled:opacity-40"
        >
          <PlayIcon className="size-[9px]" />
          {running ? "Running smoke test…" : "Run smoke test"}
        </button>
        <button
          type="button"
          onClick={refresh}
          className="cursor-pointer rounded-full border border-line-strong px-3.5 py-2 text-[12px] leading-4 text-ink hover:border-ink"
        >
          Check again
        </button>
      </div>
    </Card>
  );
};

const RealCard = () => {
  const status = useAtomValue(realStatus);
  const value = AsyncResult.isSuccess(status) ? status.value : undefined;

  return (
    <Card tone="ok" title="Real hardware" badge="REAL · READ-ONLY">
      <div className="flex flex-col gap-[9px] px-3.5 py-3">
        <Row label="Board link">{value?.connected === true ? "connected" : "none"}</Row>
        <Row label="Policy">{value?.policy ?? "read-only"}</Row>
        <Row label="Telemetry">{value?.connected === true ? "streaming" : "waiting for USB"}</Row>
        <Row label="Motor commands" tone="fail">
          blocked until M2 Safety Gate
        </Row>
      </div>
      <p className="mx-3.5 mb-3.5 border border-[#bfe5cd] bg-[#eaf7ef] px-[11px] py-[9px] text-[12px] leading-[18px] text-[#0d6b37]">
        Studio only reads telemetry from a real board and never sends it commands. The SIM flight
        keeps running here.
      </p>
    </Card>
  );
};

export const TargetPanel = () => {
  const mode = useAtomValue(studioMode);

  if (mode === "EMU") return <EmuCard />;

  if (mode === "REAL") return <RealCard />;

  return null;
};
