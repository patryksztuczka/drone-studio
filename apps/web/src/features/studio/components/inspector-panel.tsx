import { runs } from "@drone-studio/engine-client";
import { Dot } from "@drone-studio/ui/components/pill";
import { cn } from "@drone-studio/ui/lib/utils";
import { useAtom, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";

import type { InspectorTab } from "../../../shared/studio.atoms.ts";
import { inspectorTab, runsSeenAt } from "../../../shared/studio.atoms.ts";
import { HardwareInspector } from "../../hardware-inspector/index.ts";
import { RunsFeed, unseenAgentRun } from "../../runs/index.ts";
import { TelemetryPanel } from "../../telemetry/index.ts";

const TABS: ReadonlyArray<{
  readonly id: InspectorTab;
  readonly label: string;
  readonly key: string;
}> = [
  { id: "hardware", label: "Hardware", key: "1" },
  { id: "telemetry", label: "Telemetry", key: "2" },
  { id: "runs", label: "Runs · AI feed", key: "3" },
];

export const InspectorPanel = () => {
  const [tab, setTab] = useAtom(inspectorTab);
  const list = useAtomValue(runs);
  const seenAt = useAtomValue(runsSeenAt);
  const fresh = tab !== "runs" && AsyncResult.isSuccess(list) && unseenAgentRun(list.value, seenAt);

  return (
    <aside aria-label="Inspector" className="flex min-h-0 flex-1 flex-col">
      <div
        role="tablist"
        aria-label="Inspector"
        className="flex h-11 shrink-0 gap-[22px] border-b border-line px-5"
      >
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            id={`tab-${entry.id}`}
            aria-selected={tab === entry.id}
            aria-controls={`panel-${entry.id}`}
            onClick={() => setTab(entry.id)}
            className={cn(
              "-mb-px flex cursor-pointer items-center gap-1.5 border-b-2 text-[13px] leading-4 transition-colors",
              tab === entry.id
                ? "border-ink text-ink"
                : "border-transparent text-muted hover:text-ink",
            )}
          >
            {entry.label}
            <kbd className="font-label text-[10px] leading-3 text-faint">{entry.key}</kbd>
            {entry.id === "runs" && fresh ? <Dot tone="fail" title="New agent run" /> : null}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        className="min-h-0 flex-1 overflow-y-auto [scrollbar-color:#d0d0d0_transparent] [scrollbar-width:thin]"
      >
        {tab === "hardware" ? <HardwareInspector /> : null}
        {tab === "telemetry" ? <TelemetryPanel /> : null}
        {tab === "runs" ? <RunsFeed /> : null}
      </div>
    </aside>
  );
};
