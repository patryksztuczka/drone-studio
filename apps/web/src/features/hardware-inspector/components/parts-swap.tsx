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
    <section aria-label="Component swap" className="flex flex-col gap-2.5">
      <header className="flex items-center gap-2">
        <h3 className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
          COMPONENT SWAP
        </h3>
        <span className="font-mono text-[9px] text-faint">preview · hardware/ stays unchanged</span>
        {changed ? (
          <button
            type="button"
            onClick={() => setSelection(baseline)}
            className="ml-auto rounded-md border border-hairline px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
          >
            Reset
          </button>
        ) : null}
      </header>
      <div className="grid grid-cols-2 gap-1.5">
        {SLOTS.map(({ slot, label }) => {
          const swapped = selection[slot] !== baseline[slot];

          return (
            <label
              key={slot}
              className={cn(
                "flex flex-col gap-0.5 rounded-md border bg-[#0d1118] px-2 py-1.5",
                swapped ? "border-emu/50" : "border-hairline",
              )}
            >
              <span className="text-[8.5px] font-semibold tracking-[0.16em] text-faint">
                {label}
              </span>
              <select
                aria-label={label.toLowerCase()}
                value={selection[slot]}
                onChange={(event) => choose(slot, event.target.value)}
                className="w-full cursor-pointer truncate bg-transparent font-mono text-[11px] text-foreground outline-none"
              >
                {options(slot).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {fixed(item.mass_g, 1)} g
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
      {AsyncResult.isSuccess(preview) ? (
        <>
          <table className="w-full font-mono text-[11px]">
            <thead>
              <tr className="text-[8.5px] tracking-[0.14em] text-faint">
                <th className="py-1 text-left font-semibold">METRIC</th>
                <th className="py-1 text-right font-semibold">MANIFEST</th>
                <th className="py-1 text-right font-semibold">PREVIEW</th>
                <th className="py-1 text-right font-semibold">Δ</th>
              </tr>
            </thead>
            <tbody>
              {previewRows(preview.value).map((row) => (
                <tr key={row.label} className="border-t border-hairline">
                  <td className="py-1.5 font-sans text-[11.5px] text-muted-foreground">
                    {row.label}
                  </td>
                  <td className="py-1.5 text-right text-faint tabular-nums">
                    {fixed(row.baseline, row.digits)}
                  </td>
                  <td className="py-1.5 text-right text-foreground tabular-nums">
                    {fixed(row.value, row.digits)}
                    <span className="ml-0.5 text-[9px] text-faint">{row.unit}</span>
                  </td>
                  <td
                    className={cn(
                      "py-1.5 text-right tabular-nums",
                      row.verdict === "better" ? "text-real" : undefined,
                      row.verdict === "worse" ? "text-danger" : undefined,
                      row.verdict === "same" ? "text-faint" : undefined,
                    )}
                  >
                    {row.verdict === "same" ? "·" : signed(row.delta, row.digits)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.value.warnings.map((warning) => (
            <p
              key={warning}
              className="rounded-md border border-emu/30 bg-[#f5a52410] px-2.5 py-1.5 text-[11px] text-[#fcd34d]"
            >
              {warning}
            </p>
          ))}
          {preview.value.simulated_firmware_matches ? null : (
            <p className="text-[10.5px] leading-relaxed text-faint">
              The simulator keeps flying the manifest. Edit hardware/ and run codegen to fly this
              build.
            </p>
          )}
        </>
      ) : (
        <p className="font-mono text-[11px] text-faint">Recalculating…</p>
      )}
    </section>
  );
};
