import { CatalogItemId, hardwareCatalog, hardwarePreview } from "@drone-studio/engine-client";
import type { BoardLayout, CatalogItem, PartSelection } from "@drone-studio/engine-client";
import { cn } from "@drone-studio/ui/lib/utils";
import { useAtom, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { useEffect, useState } from "react";

import { fixed, signed } from "../../../shared/format.ts";
import { previewRows } from "../preview-deltas.ts";

type Slot = keyof PartSelection;

const SLOTS: ReadonlyArray<{ readonly slot: Slot; readonly label: string }> = [
  { slot: "battery", label: "BATTERY" },
  { slot: "motor", label: "MOTORS" },
  { slot: "prop", label: "PROPS" },
  { slot: "frame", label: "FRAME" },
];

const baselineOf = (layout: BoardLayout): PartSelection => {
  const chosen = layout.airframe.components_selected;

  return {
    battery: chosen["battery"] ?? CatalogItemId.make(""),
    motor: chosen["motor"] ?? CatalogItemId.make(""),
    prop: chosen["prop"] ?? CatalogItemId.make(""),
    frame: chosen["frame"] ?? CatalogItemId.make(""),
  };
};

const CATALOG_GROUPS = {
  battery: "batteries",
  motor: "motors",
  prop: "props",
  frame: "frames",
} as const;

const VERDICT_CLASSES = { better: "text-ok", worse: "text-fail", same: "text-faint" } as const;

const LABELS: ReadonlyMap<string, string> = new Map([
  ["Max thrust per rotor", "Max thrust / rotor"],
]);

const shortName = (item: CatalogItem) =>
  item.name.replace(/ brushless$/, "").replace(/ tri-blade$/, " tri");

interface PartsSwapProps {
  readonly layout: BoardLayout;
}

export const PartsSwap = ({ layout }: PartsSwapProps) => {
  const catalog = useAtomValue(hardwareCatalog);
  const [preview, requestPreview] = useAtom(hardwarePreview);
  const baseline = baselineOf(layout);
  const [selection, setSelection] = useState<PartSelection>(baseline);
  const airframe = layout.airframe.id;

  useEffect(() => {
    requestPreview({ airframe, selection });
  }, [airframe, selection, requestPreview]);

  const choose = (slot: Slot, value: string) =>
    setSelection({ ...selection, [slot]: CatalogItemId.make(value) });

  const changed = SLOTS.some(({ slot }) => selection[slot] !== baseline[slot]);

  const options = (slot: Slot): ReadonlyArray<CatalogItem> =>
    AsyncResult.isSuccess(catalog) ? catalog.value[CATALOG_GROUPS[slot]] : [];

  return (
    <section aria-label="Component swap" className="flex flex-col gap-2 px-5 py-2.5">
      <header className="flex items-baseline justify-between">
        <div className="flex flex-col gap-px">
          <h3 className="font-label text-[11px] leading-[14px] font-normal text-ink-soft">
            COMPONENT SWAP
          </h3>
          <p className="text-[11px] leading-[14px] text-faint">
            preview · hardware/ stays unchanged
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSelection(baseline)}
          disabled={!changed}
          className="cursor-pointer rounded-full border border-line-strong px-2.5 py-[3px] text-[12px] leading-4 text-ink hover:border-ink disabled:cursor-default disabled:opacity-40"
        >
          Reset
        </button>
      </header>
      <div className="grid grid-cols-2 gap-1.5">
        {SLOTS.map(({ slot, label }) => {
          const swapped = selection[slot] !== baseline[slot];

          return (
            <label
              key={slot}
              className={cn(
                "relative flex flex-col gap-px border px-2 py-[5px]",
                swapped ? "border-amber bg-[#fff8ec]" : "border-line-strong",
              )}
            >
              <span className="font-label text-[9px] leading-3 text-faint">{label}</span>
              <select
                aria-label={label.toLowerCase()}
                value={selection[slot]}
                onChange={(event) => choose(slot, event.target.value)}
                className="w-full cursor-pointer appearance-none truncate bg-transparent pr-3 text-[11px] leading-[14px] text-ink outline-none"
              >
                {options(slot).map((item) => (
                  <option key={item.id} value={item.id}>
                    {shortName(item)}
                  </option>
                ))}
              </select>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-2 bottom-[5px] text-[9px] leading-[14px] text-ink"
              >
                ▾
              </span>
            </label>
          );
        })}
      </div>
      {AsyncResult.isSuccess(preview) ? (
        <>
          <table className="w-full">
            <thead>
              <tr className="border-b border-line font-label text-[9px] leading-3 text-faint">
                <th className="w-[37%] py-1 text-left font-normal">METRIC</th>
                <th className="py-1 text-right font-normal">MANIFEST</th>
                <th className="py-1 text-right font-normal">PREVIEW</th>
                <th className="w-[18%] py-1 text-right font-normal">Δ</th>
              </tr>
            </thead>
            <tbody>
              {previewRows(preview.value).map((row) => (
                <tr key={row.label} className="text-[11px] leading-[14px]">
                  <td className="py-[3px] text-ink">{LABELS.get(row.label) ?? row.label}</td>
                  <td className="py-[3px] text-right font-label text-muted tabular-nums">
                    {fixed(row.baseline, row.digits)}
                    {row.unit === ":1" ? "" : ` ${row.unit}`}
                  </td>
                  <td className="py-[3px] text-right font-label text-ink tabular-nums">
                    {fixed(row.value, row.digits)}
                    {row.unit === ":1" ? "" : ` ${row.unit}`}
                  </td>
                  <td
                    className={cn(
                      "py-[3px] text-right font-label tabular-nums",
                      VERDICT_CLASSES[row.verdict],
                    )}
                  >
                    {row.verdict === "same" ? "·" : signed(row.delta, row.digits)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.value.warnings.map((warning) => (
            <p key={warning} className="text-[11px] leading-4 text-amber">
              {warning}
            </p>
          ))}
          {preview.value.simulated_firmware_matches ? null : (
            <p className="text-[11px] leading-4 text-amber">
              The simulator keeps flying the manifest. Edit hardware/ and run codegen to fly this
              build.
            </p>
          )}
        </>
      ) : (
        <p className="font-label text-[11px] text-faint">recalculating…</p>
      )}
    </section>
  );
};
