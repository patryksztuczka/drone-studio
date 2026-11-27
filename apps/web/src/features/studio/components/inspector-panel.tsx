import { cn } from "@drone-studio/ui/lib/utils";
import { useAtom } from "@effect/atom-react";

import type { InspectorTab } from "../../../shared/studio.atoms.ts";
import { inspectorTab } from "../../../shared/studio.atoms.ts";
import { HardwareInspector } from "../../hardware-inspector/index.ts";
import { RunsFeed } from "../../runs/index.ts";
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

  return (
    <aside
      aria-label="Inspector"
      className="flex w-[430px] shrink-0 flex-col border-l border-hairline bg-panel"
    >
      <div
        role="tablist"
        aria-label="Inspector"
        className="flex h-10 shrink-0 items-end gap-1 border-b border-hairline px-2"
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
              "relative flex h-9 items-center gap-1.5 px-3 text-[12px] font-medium transition-colors",
              tab === entry.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {entry.label}
            <kbd className="font-mono text-[9px] text-faint">{entry.key}</kbd>
            {tab === entry.id ? (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-sim" />
            ) : null}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        className="min-h-0 flex-1 overflow-y-auto p-3 [scrollbar-color:#1f2632_transparent] [scrollbar-width:thin]"
      >
        {tab === "hardware" ? <HardwareInspector /> : null}
        {tab === "telemetry" ? <TelemetryPanel /> : null}
        {tab === "runs" ? <RunsFeed /> : null}
      </div>
    </aside>
  );
};
