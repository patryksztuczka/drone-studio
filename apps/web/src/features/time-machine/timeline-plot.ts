import type { SampleTable } from "@drone-studio/engine-client";

import type { Span } from "./timeline-math.ts";
import { fractionOf } from "./timeline-math.ts";

export interface PlotBox {
  readonly width: number;
  readonly top: number;
  readonly bottom: number;
}

export interface ValueRange {
  readonly min: number;
  readonly max: number;
}

export const valueRange = (
  tables: ReadonlyArray<SampleTable>,
  column: string,
  until: number,
): ValueRange => {
  let min = 0;
  let max = Number.NEGATIVE_INFINITY;

  for (const table of tables.filter((candidate) => candidate.has(column))) {
    const values = table.column(column);
    const times = table.column("t");

    values.forEach((value, index) => {
      if ((times[index] ?? 0) > until || !Number.isFinite(value)) return;

      min = Math.min(min, value);
      max = Math.max(max, value);
    });
  }

  if (!Number.isFinite(max) || max - min < 0.5) return { min, max: min + 0.5 };

  return { min, max: max + (max - min) * 0.06 };
};

export const plotY = (value: number, range: ValueRange, box: PlotBox) => {
  if (!Number.isFinite(value)) return box.bottom;

  const fraction = (value - range.min) / Math.max(range.max - range.min, 1e-9);

  return box.bottom - Math.min(Math.max(fraction, 0), 1) * (box.bottom - box.top);
};

export const seriesPath = (
  table: SampleTable,
  column: string,
  span: Span,
  range: ValueRange,
  box: PlotBox,
) => {
  if (table.length < 2 || box.width <= 0 || !table.has(column)) return "";

  const end = Math.min(span.end, table.endTime);
  const start = Math.max(span.start, table.startTime);

  if (end <= start) return "";

  const points = Math.max(Math.min(Math.round(box.width / 2), 700), 2);

  return Array.from({ length: points }, (_, index) => {
    const t = start + ((end - start) * index) / (points - 1);
    const x = fractionOf(t, span) * box.width;
    const y = plotY(table.sample(column, t), range, box);

    return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join("");
};
