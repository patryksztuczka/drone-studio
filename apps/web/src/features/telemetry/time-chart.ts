import type { SampleTable } from "@drone-studio/engine-client";
import uPlot from "uplot";

import { chartWindow, columnsIn } from "./chart-window.ts";

export interface SeriesSpec {
  readonly column: string;
  readonly label: string;
  readonly color: string;
  readonly dashed?: boolean;
  readonly scale?: string;
  readonly scaleBy?: number;
}

export interface AxisSpec {
  readonly scale: string;
  readonly unit: string;
  readonly side: "left" | "right";
  readonly range?: readonly [number, number];
}

export interface ChartSpec {
  readonly series: ReadonlyArray<SeriesSpec>;
  readonly axes: ReadonlyArray<AxisSpec>;
}

const FONT = '10px "JetBrains Mono Variable", ui-monospace, monospace';

const GRID = "#1b212c";

const AXIS_SIDES = { bottom: 2, left: 3, right: 1 } as const;

const AXIS = "#4a5466";

export const chartAxis = (
  side: "left" | "right" | "bottom",
  scale: string,
  unit: string,
): uPlot.Axis => ({
  scale,
  side: AXIS_SIDES[side],
  stroke: AXIS,
  font: FONT,
  size: side === "bottom" ? 22 : 40,
  gap: 3,
  ticks: { show: false },
  grid: { show: side !== "right", stroke: GRID, width: 1 },
  values: (_chart, ticks) => ticks.map((tick) => `${String(Number(tick.toFixed(2)))}${unit}`),
});

export const line = (series: SeriesSpec, fallbackScale: string): uPlot.Series => {
  const plain: uPlot.Series = {
    label: series.label,
    stroke: series.color,
    width: 1.4,
    scale: series.scale ?? fallbackScale,
    points: { show: false },
  };

  return series.dashed === true ? { ...plain, dash: [4, 3] } : plain;
};

export class TimeChart {
  private readonly plot: uPlot;
  private readonly spec: ChartSpec;
  private cursorT = Number.NaN;
  private lastKey = "";

  constructor(element: HTMLElement, spec: ChartSpec, width: number, height: number) {
    this.spec = spec;

    const scales: uPlot.Scales = { x: { time: false } };

    for (const axis of spec.axes) {
      scales[axis.scale] =
        axis.range === undefined
          ? { auto: true }
          : { auto: false, range: [axis.range[0], axis.range[1]] };
    }

    this.plot = new uPlot(
      {
        width,
        height,
        legend: { show: false },
        cursor: {
          sync: { key: "studio-telemetry" },
          points: { size: 5 },
          drag: { x: false, y: false },
        },
        scales,
        series: [{}, ...spec.series.map((series) => line(series, spec.axes[0]?.scale ?? "y"))],
        axes: [
          chartAxis("bottom", "x", "s"),
          ...spec.axes.map((axis) => chartAxis(axis.side, axis.scale, axis.unit)),
        ],
        hooks: {
          draw: [
            (chart) => {
              if (!Number.isFinite(this.cursorT)) return;

              const x = chart.valToPos(this.cursorT, "x", true);
              const context = chart.ctx;

              context.save();
              context.strokeStyle = "#22d3ee";
              context.lineWidth = 1.5 * devicePixelRatio;
              context.beginPath();
              context.moveTo(x, chart.bbox.top);
              context.lineTo(x, chart.bbox.top + chart.bbox.height);
              context.stroke();
              context.restore();
            },
          ],
        },
      },
      [[], ...spec.series.map(() => [])],
      element,
    );
  }

  update(table: SampleTable, key: string, live: boolean, t: number) {
    const window = chartWindow(table, live, t);
    const dataKey = `${key}|${String(table.length)}|${live ? window.max.toFixed(2) : ""}`;

    this.cursorT = t;

    if (dataKey !== this.lastKey) {
      this.lastKey = dataKey;

      const columns = columnsIn(table, window, [
        "t",
        ...this.spec.series.map((series) => series.column),
      ]);

      const scaled = columns.map((column, index) => {
        const factor = index === 0 ? undefined : this.spec.series[index - 1]?.scaleBy;

        return factor === undefined ? column : column.map((value) => value * factor);
      });

      this.plot.batch(() => {
        this.plot.setData(scaled, false);
        this.plot.setScale("x", { min: window.min, max: window.max });
      });

      return;
    }

    this.plot.redraw(false, false);
  }

  clear() {
    this.lastKey = "";
    this.cursorT = Number.NaN;
    this.plot.setData([[], ...this.spec.series.map(() => [])]);
  }

  resize(width: number, height: number) {
    this.plot.setSize({ width, height });
  }

  dispose() {
    this.plot.destroy();
  }
}
