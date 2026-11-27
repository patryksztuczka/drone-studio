import { CatalogItemId, hardwareCatalog, hardwarePreview } from "@drone-studio/engine-client";
import type { BoardLayout, CatalogItem, PartSelection } from "@drone-studio/engine-client";
import { CardHeader, SchematicCard } from "@drone-studio/ui/components/schematic-card";
import { cn } from "@drone-studio/ui/lib/utils";
import { useAtom, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { useEffect, useState } from "react";

import { fixed, signed } from "../../../shared/format.ts";
import { previewRows } from "../preview-deltas.ts";
import type { PreviewRow } from "../preview-deltas.ts";

type Slot = keyof PartSelection;

const SLOTS: ReadonlyArray<{ readonly slot: Slot; readonly label: string }> = [
  { slot: "battery", label: "battery" },
  { slot: "motor", label: "motor" },
  { slot: "prop", label: "prop" },
];

const CATALOG_GROUPS = {
  battery: "batteries",
  motor: "motors",
  prop: "props",
  frame: "frames",
} as const;

const baselineOf = (layout: BoardLayout): PartSelection => {
  const chosen = layout.airframe.components_selected;

  return {
    battery: chosen["battery"] ?? CatalogItemId.make(""),
    motor: chosen["motor"] ?? CatalogItemId.make(""),
    prop: chosen["prop"] ?? CatalogItemId.make(""),
    frame: chosen["frame"] ?? CatalogItemId.make(""),
  };
};

const shortName = (item: CatalogItem) => item.name.replace(/ (brushless|LiPo|LiHV|tri-blade)$/, "");

const VERDICT_CLASSES = { better: "text-ok", worse: "text-fail", same: "text-faint" } as const;

const Figure = ({
  row,
  label,
}: {
  readonly row: PreviewRow | undefined;
  readonly label: string;
}) => (
  <div className="flex flex-1 basis-0 flex-col gap-0.5">
    <span className="flex items-baseline gap-1.5">
      <span className="font-display font-sans text-[26px] leading-8 text-ink tabular-nums">
        {row === undefined
          ? "–"
          : row.unit === "g"
            ? `${fixed(row.value, 0)} g`
            : fixed(row.value, row.digits)}
      </span>
      {row === undefined || row.verdict === "same" ? null : (
        <span className={cn("text-[11px] leading-[14px]", VERDICT_CLASSES[row.verdict])}>
          {signed(row.delta, row.unit === "g" ? 0 : row.digits)}
        </span>
      )}
    </span>
    <span className="text-[11px] leading-[14px] whitespace-nowrap text-faint">{label}</span>
  </div>
);

interface AirframeCardProps {
  readonly layout: BoardLayout;
}

export const AirframeCard = ({ layout }: AirframeCardProps) => {
  const catalog = useAtomValue(hardwareCatalog);
  const [preview, requestPreview] = useAtom(hardwarePreview);
  const baseline = baselineOf(layout);
  const [selection, setSelection] = useState<PartSelection>(baseline);
  const airframe = layout.airframe.id;

  useEffect(() => {
    requestPreview({ airframe, selection });
  }, [airframe, selection, requestPreview]);

  const options = (slot: Slot): ReadonlyArray<CatalogItem> =>
    AsyncResult.isSuccess(catalog) ? catalog.value[CATALOG_GROUPS[slot]] : [];

  const changed = SLOTS.some(({ slot }) => selection[slot] !== baseline[slot]);
  const rows = AsyncResult.isSuccess(preview) ? previewRows(preview.value) : [];
  const row = (label: string) => rows.find((candidate) => candidate.label === label);
  const hover = row("Hover time");

  return (
    <SchematicCard aria-label="Airframe" className="w-[240px]">
      <CardHeader
        title="Airframe"
        aside={
          changed ? (
            <button
              type="button"
              onClick={() => setSelection(baseline)}
              className="cursor-pointer text-blue hover:underline"
            >
              reset
            </button>
          ) : (
            airframe
          )
        }
      />
      <div className="flex px-3.5 pt-3.5 pb-3">
        <Figure row={row("All-up mass")} label="mass" />
        <Figure row={row("Thrust to weight")} label="thrust / weight" />
      </div>
      <div className="flex flex-col border-t border-line">
        {SLOTS.map(({ slot, label }) => {
          const swapped = selection[slot] !== baseline[slot];

          return (
            <label
              key={slot}
              className="flex items-center justify-between gap-3 border-b border-line px-3.5 py-2.5 last:border-b-0"
            >
              <span className="text-muted">{label}</span>
              <span className="relative flex min-w-0 items-center gap-1">
                <select
                  aria-label={label}
                  value={selection[slot]}
                  onChange={(event) =>
                    setSelection({ ...selection, [slot]: CatalogItemId.make(event.target.value) })
                  }
                  className={cn(
                    "min-w-0 cursor-pointer appearance-none truncate bg-transparent text-right font-sans text-[13px] leading-4 outline-none",
                    swapped ? "text-blue" : "text-ink",
                  )}
                >
                  {options(slot).map((item) => (
                    <option key={item.id} value={item.id}>
                      {shortName(item)}
                    </option>
                  ))}
                </select>
                <span aria-hidden="true" className="text-[9px] text-ink">
                  ▾
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {hover === undefined ? null : (
        <div className="flex items-baseline justify-between border-t border-line px-3.5 py-2.5">
          <span className="text-muted">hover</span>
          <span className="tabular-nums">
            {fixed(hover.value, 2)} min
            {hover.verdict === "same" ? null : (
              <span className={cn("ml-1.5", VERDICT_CLASSES[hover.verdict])}>
                {signed(hover.delta, 2)}
              </span>
            )}
          </span>
        </div>
      )}
      {AsyncResult.isSuccess(preview) && preview.value.warnings.length > 0 ? (
        <div className="flex flex-col gap-1.5 border-t border-line px-3.5 py-2.5 text-[11px] leading-[15px] text-amber">
          {preview.value.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}
      {changed ? (
        <p className="border-t border-line px-3.5 py-2.5 text-[11px] leading-[15px] text-faint">
          preview only · the simulator flies hardware/ until you change it there
        </p>
      ) : null}
    </SchematicCard>
  );
};
