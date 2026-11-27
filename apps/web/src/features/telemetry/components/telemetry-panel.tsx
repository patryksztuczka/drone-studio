import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { Option } from "effect";
import { useContext, useEffect, useRef } from "react";

import "uplot/dist/uPlot.min.css";

import { observeSize, writeText } from "../../../shared/dom.ts";
import { activeFlight, followLive, playhead } from "../../../shared/studio.atoms.ts";
import { SpectrumChart } from "../spectrum-chart.ts";
import { activeSpectrum } from "../telemetry.atoms.ts";
import { TimeChart } from "../time-chart.ts";
import type { ChartSpec } from "../time-chart.ts";

const SPECTRUM_HEIGHT = 70;

interface ChartCardProps {
  readonly title: string;
  readonly unit: string;
  readonly spec: ChartSpec;
  readonly digits: number;
  readonly height: number;
}

const legendPrefix = (spec: ChartSpec, dashed: boolean | undefined) => {
  if (dashed === true) return "-- ";

  return spec.series.some((series) => series.dashed === true) ? "— " : "";
};

const ChartCard = ({ title, unit, spec, digits, height }: ChartCardProps) => {
  const registry = useContext(RegistryContext);
  const host = useRef<HTMLDivElement>(null);
  const values = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    const element = host.current;

    if (element === null) return;

    const chart = new TimeChart(element, spec, Math.max(element.clientWidth, 200), height);

    const stopObserving = observeSize(element, (width) =>
      chart.resize(Math.max(width, 200), height),
    );

    let frame = 0;
    let hadFlight = false;

    const tick = () => {
      const flight = registry.get(activeFlight);
      const t = registry.get(playhead);

      if (Option.isSome(flight) && flight.value.table.length > 1) {
        const view = flight.value;

        hadFlight = true;
        chart.update(view.table, view.key, view.live && registry.get(followLive), t);
        spec.series.forEach((series, index) => {
          const target = values.current[index];
          const value = view.table.sample(series.column, t) * (series.scaleBy ?? 1);

          if (target !== null && target !== undefined) {
            writeText(target, Number.isFinite(value) ? value.toFixed(digits) : "–");
          }
        });
      } else if (hadFlight) {
        hadFlight = false;
        chart.clear();
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      stopObserving();
      chart.dispose();
    };
  }, [registry, spec, digits, height]);

  return (
    <section
      aria-label={title}
      className="flex flex-col gap-1.5 border-b border-line px-5 pt-3.5 pb-3 font-label text-[11px] leading-[14px]"
    >
      <header className="flex justify-between">
        <h3 className="font-normal text-ink-soft uppercase">{title}</h3>
        <span className="text-faint">{unit}</span>
      </header>
      <div className="flex flex-wrap gap-x-3">
        {spec.series.map((series, index) => (
          <span key={series.column} className="whitespace-nowrap" style={{ color: series.color }}>
            {legendPrefix(spec, series.dashed)}
            {series.label}{" "}
            <span
              ref={(element) => {
                values.current[index] = element;
              }}
              className="tabular-nums"
            >
              –
            </span>
          </span>
        ))}
      </div>
      <div ref={host} className="w-full" style={{ height }} />
    </section>
  );
};

const SpectrumCard = () => {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<SpectrumChart | null>(null);
  const spectrum = useAtomValue(activeSpectrum);

  useEffect(() => {
    const element = host.current;

    if (element === null) return;

    const created = new SpectrumChart(element, Math.max(element.clientWidth, 200), SPECTRUM_HEIGHT);

    const stopObserving = observeSize(element, (width) =>
      created.resize(Math.max(width, 200), SPECTRUM_HEIGHT),
    );

    chart.current = created;

    return () => {
      stopObserving();
      created.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.update(Option.getOrUndefined(spectrum));
  }, [spectrum]);

  const peak = Option.match(spectrum, {
    onNone: () => undefined,
    onSome: (value) => {
      let best = 0;

      value.accel_z.forEach((amplitude, index) => {
        if (index > 4 && amplitude > (value.accel_z[best] ?? 0)) best = index;
      });

      return value.freq_hz[best];
    },
  });

  return (
    <section
      aria-label="IMU vibration"
      className="flex flex-col gap-1.5 px-5 pt-3.5 pb-3 font-label text-[11px] leading-[14px]"
    >
      <header className="flex justify-between">
        <h3 className="font-normal text-ink-soft">IMU VIBRATION FFT</h3>
        <span className="text-faint">1024 samples · dB</span>
      </header>
      <div className="flex gap-3">
        <span className="text-blue">accel z</span>
        <span className="text-magenta">gyro x</span>
        <span className="text-ink">peak {peak === undefined ? "–" : `${peak.toFixed(1)} Hz`}</span>
      </div>
      <div ref={host} className="w-full" style={{ height: SPECTRUM_HEIGHT }} />
      <div className="flex justify-between text-[10px] leading-3 text-faint">
        <span>0 Hz</span>
        <span>250 Hz</span>
      </div>
    </section>
  );
};

const ATTITUDE: ChartSpec = {
  series: [
    { column: "roll", label: "roll", color: "#0a6cff" },
    { column: "sp_roll", label: "sp", color: "#0a6cff", dashed: true },
    { column: "pitch", label: "pitch", color: "#e58a00" },
    { column: "sp_pitch", label: "sp", color: "#e58a00", dashed: true },
  ],
  axes: [{ scale: "deg", unit: "°", side: "left" }],
};

const MOTORS: ChartSpec = {
  series: [
    { column: "motor_1", label: "M1", color: "#0a6cff", scaleBy: 100 },
    { column: "motor_2", label: "M2", color: "#7c5cff", scaleBy: 100 },
    { column: "motor_3", label: "M3", color: "#d6409f", scaleBy: 100 },
    { column: "motor_4", label: "M4", color: "#5e9e00", scaleBy: 100 },
  ],
  axes: [{ scale: "pct", unit: "%", side: "left", range: [0, 100] }],
};

const BATTERY: ChartSpec = {
  series: [
    { column: "bat_v", label: "pack", color: "#12a150", scale: "volts" },
    { column: "bat_a", label: "current", color: "#e58a00", scale: "amps" },
  ],
  axes: [
    { scale: "volts", unit: "V", side: "left" },
    { scale: "amps", unit: "A", side: "right" },
  ],
};

export const TelemetryPanel = () => (
  <div className="flex flex-col">
    <ChartCard title="Attitude vs setpoint" unit="deg" spec={ATTITUDE} digits={1} height={78} />
    <ChartCard
      title="Motor outputs"
      unit="% command · 0–100"
      spec={MOTORS}
      digits={0}
      height={78}
    />
    <ChartCard title="Battery" unit="V · A" spec={BATTERY} digits={2} height={70} />
    <SpectrumCard />
  </div>
);
