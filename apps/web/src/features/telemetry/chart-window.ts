import type { SampleTable } from "@drone-studio/engine-client";

export interface ChartWindow {
  readonly min: number;
  readonly max: number;
}

export const LIVE_WINDOW_S = 12;

export const chartWindow = (table: SampleTable, live: boolean, t: number): ChartWindow => {
  const start = table.startTime;
  const end = table.endTime;

  if (!live) return { min: start, max: Math.max(end, start + 0.1) };

  const max = Math.max(t, start + LIVE_WINDOW_S);

  return { min: Math.max(start, max - LIVE_WINDOW_S), max };
};

export const rowsIn = (table: SampleTable, window: ChartWindow) => {
  if (table.length === 0) return { from: 0, to: 0 };

  return { from: table.rowAt(window.min), to: Math.min(table.rowAt(window.max) + 2, table.length) };
};

export const columnsIn = (
  table: SampleTable,
  window: ChartWindow,
  names: ReadonlyArray<string>,
) => {
  const { from, to } = rowsIn(table, window);

  return names.map((name) => table.column(name).subarray(from, to));
};
