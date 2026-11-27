import type { SampleTable } from "@drone-studio/engine-client";

export const recentValues = (
  table: SampleTable,
  column: string,
  t: number,
  seconds: number,
  points: number,
): ReadonlyArray<number> => {
  if (table.length === 0 || !table.has(column) || points < 2) return [];

  const end = Math.min(Math.max(t, table.startTime), table.endTime);
  const start = Math.max(table.startTime, end - seconds);

  return Array.from({ length: points }, (_, index) =>
    table.sample(column, start + ((end - start) * index) / (points - 1)),
  );
};

export const sparkPath = (values: ReadonlyArray<number>, width: number, height: number) => {
  const finite = values.filter((value) => Number.isFinite(value));

  if (finite.length < 2) return `M0 ${String(height / 2)}H${String(width)}`;

  const low = Math.min(...finite);
  const high = Math.max(...finite);
  const spread = high - low < 1e-6 ? 1 : high - low;

  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const level = Number.isFinite(value) ? (value - low) / spread : 0.5;
      const y = height - 2 - level * (height - 4);

      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join("");
};
