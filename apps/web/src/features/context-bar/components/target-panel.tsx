import { emuStatus, realStatus } from "@drone-studio/engine-client";
import { useAtom, useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import type { ReactNode } from "react";

import { CloseIcon } from "../../../shared/icons.tsx";
import { studioMode } from "../../../shared/studio.atoms.ts";

interface RowProps {
  readonly label: string;
  readonly children: ReactNode;
}

const Row = ({ label, children }: RowProps) => (
  <div className="flex items-baseline justify-between gap-6 border-b border-hairline py-1.5 last:border-0">
    <span className="text-[11px] text-muted-foreground">{label}</span>
    <span className="font-mono text-[11px] text-foreground">{children}</span>
  </div>
);

interface CardProps {
  readonly tone: string;
  readonly title: string;
  readonly badge: string;
  readonly children: ReactNode;
}

const Card = ({ tone, title, badge, children }: CardProps) => {
  const [, setMode] = useAtom(studioMode);

  return (
    <section
      aria-label={title}
      className="pointer-events-auto absolute top-14 right-3 w-[340px] rounded-lg border bg-[#0b0e14e6] p-4 backdrop-blur-md"
      style={{ borderColor: `${tone}55`, boxShadow: `0 0 40px ${tone}14` }}
    >
      <header className="mb-3 flex items-center gap-2">
        <span
          className="rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.14em] text-[#0b0e14]"
          style={{ background: tone }}
        >
          {badge}
        </span>
        <h2 className="text-[13px] font-semibold">{title}</h2>
        <button
          type="button"
          aria-label="Back to SIM"
          onClick={() => setMode("SIM")}
          className="ml-auto text-muted-foreground hover:text-foreground"
        >
          <CloseIcon width={14} height={14} />
        </button>
      </header>
      {children}
    </section>
  );
};

const EmuCard = () => {
  const status = useAtomValue(emuStatus);
  const refresh = useAtomRefresh(emuStatus);

  return (
    <Card tone="#f5a524" title="Renode emulation" badge="EMU">
      {AsyncResult.isSuccess(status) ? (
        <>
          <Row label="Docker">{status.value.docker ?? "not found"}</Row>
          <Row label="Firmware ELF">{status.value.elf_built ? "built" : "not built"}</Row>
          <Row label="Renode platform">{status.value.repl ? "generated" : "missing"}</Row>
          <Row label="Last smoke test">
            {status.value.last_smoke === null ? "never" : "recorded"}
          </Row>
          <p className="mt-3 rounded-md bg-[#f5a52412] px-3 py-2 font-mono text-[11px] leading-relaxed text-[#fcd34d]">
            {status.value.hint}
          </p>
        </>
      ) : (
        <p className="font-mono text-[11px] text-muted-foreground">Asking drone-engine…</p>
      )}
      <button
        type="button"
        onClick={refresh}
        className="mt-3 h-7 rounded-md border border-hairline px-3 text-[11px] text-muted-foreground hover:text-foreground"
      >
        Check again
      </button>
    </Card>
  );
};

const RealCard = () => {
  const status = useAtomValue(realStatus);

  return (
    <Card tone="#10b981" title="Real hardware" badge="REAL · READ-ONLY">
      <Row label="Board link">
        {AsyncResult.isSuccess(status) && status.value.connected ? "connected" : "none"}
      </Row>
      <Row label="Policy">{AsyncResult.isSuccess(status) ? status.value.policy : "read-only"}</Row>
      <Row label="Motor commands">
        <span className="text-danger">blocked until the M2 Safety Gate</span>
      </Row>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        {AsyncResult.isSuccess(status)
          ? status.value.detail
          : "Studio only reads telemetry from a real board and never sends it commands."}
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
