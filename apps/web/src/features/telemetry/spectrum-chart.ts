import type { Spectrum } from "@drone-studio/engine-client";
import uPlot from "uplot";

import { chartAxis, line } from "./time-chart.ts";

const FLOOR = 1e-5;

const decibels = (amplitude: number) => 20 * Math.log10(Math.max(amplitude, FLOOR));

export class SpectrumChart {
  private readonly plot: uPlot;
  private last: Spectrum | undefined;

  constructor(element: HTMLElement, width: number, height: number) {
    this.plot = new uPlot(
      {
        width,
        height,
        legend: { show: false },
        cursor: { points: { size: 5 }, drag: { x: false, y: false } },
        scales: { x: { time: false, auto: false, range: [0, 250] }, y: { auto: true } },
        series: [
          {},
          line({ column: "accel_z", label: "accel z", color: "#0a6cff" }, "y"),
          line({ column: "gyro_x", label: "gyro x", color: "#111111" }, "y"),
        ],
        axes: [chartAxis("bottom", "x", "Hz"), chartAxis("left", "y", "dB")],
      },
      [[], [], []],
      element,
    );
  }

  update(spectrum: Spectrum | undefined) {
    if (spectrum === this.last) return;

    this.last = spectrum;

    if (spectrum === undefined) {
      this.plot.setData([[], [], []]);

      return;
    }

    this.plot.setData([
      Float64Array.from(spectrum.freq_hz),
      Float64Array.from(spectrum.accel_z, decibels),
      Float64Array.from(spectrum.gyro_x, decibels),
    ]);
  }

  resize(width: number, height: number) {
    this.plot.setSize({ width, height });
  }

  dispose() {
    this.plot.destroy();
  }
}
