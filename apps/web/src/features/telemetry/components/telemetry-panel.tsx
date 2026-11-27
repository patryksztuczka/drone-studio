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

const CHART_HEIGHT = 128;

interface ChartCardProps {
  readonly title: string;
  readonly unit: string;
  readonly spec: ChartSpec;
  readonly digits: number;
}

const ChartCard = ({ title, unit, spec, digits }: ChartCardProps) => {
  const registry = useContext(RegistryContext);
  const host = useRef<HTMLDivElement>(null);
  const values = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    const element = host.current;

    if (element === null) return;

    const chart = new TimeChart(element, spec, Math.max(element.clientWidth, 200), CHART_HEIGHT);

    const stopObserving = observeSize(element, (width) =>
      chart.resize(Math.max(width, 200), CHART_HEIGHT),
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
  }, [registry, spec, digits]);

  return (
    <section
      aria-label={title}
      className="rounded-lg border border-hairline bg-[#0d1118] px-2.5 pt-2 pb-1"
    >
      <header className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
          {title}
        </h3>
        <span className="font-mono text-[9px] text-faint">{unit}</span>
        <div className="ml-auto flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
          {spec.series.map((series, index) => (
            <span key={series.column} className="flex items-center gap-1 font-mono text-[10px]">
              <span
                className="inline-block h-0.5 w-2.5 rounded-full"
                style={{
                  background: series.dashed === true ? "transparent" : series.color,
                  borderTop: series.dashed === true ? `1.5px dashed ${series.color}` : undefined,
                }}
              />
              <span className="text-faint">{series.label}</span>
              <span
                ref={(element) => {
                  values.current[index] = element;
                }}
                className="min-w-9 text-right tabular-nums"
                style={{ color: series.color }}
              >
                –
              </span>
            </span>
          ))}
        </div>
      </header>
      <div ref={host} className="w-full" style={{ height: CHART_HEIGHT }} />
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

    const created = new SpectrumChart(element, Math.max(element.clientWidth, 200), CHART_HEIGHT);

    const stopObserving = observeSize(element, (width) =>
      created.resize(Math.max(width, 200), CHART_HEIGHT),
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
      className="rounded-lg border border-hairline bg-[#0d1118] px-2.5 pt-2 pb-1"
    >
      <header className="mb-1 flex items-center gap-3">
        <h3 className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
          IMU VIBRATION FFT
        </h3>
        <span className="font-mono text-[9px] text-faint">1024 samples · dB</span>
        <span className="ml-auto flex items-center gap-2.5 font-mono text-[10px]">
          <span className="text-sim">accel z</span>
          <span className="text-[#f472b6]">gyro x</span>
          <span className="text-faint">
            peak {peak === undefined ? "–" : `${peak.toFixed(1)} Hz`}
          </span>
        </span>
      </header>
      <div ref={host} className="w-full" style={{ height: CHART_HEIGHT }} />
    </section>
  );
};

const ATTITUDE: ChartSpec = {
  series: [
    { column: "roll", label: "roll", color: "#22d3ee" },
    { column: "sp_roll", label: "sp", color: "#22d3ee", dashed: true },
    { column: "pitch", label: "pitch", color: "#f5a524" },
    { column: "sp_pitch", label: "sp", color: "#f5a524", dashed: true },
  ],
  axes: [{ scale: "deg", unit: "°", side: "left" }],
};

const MOTORS: ChartSpec = {
  series: [
    { column: "motor_1", label: "M1", color: "#22d3ee", scaleBy: 100 },
    { column: "motor_2", label: "M2", color: "#a78bfa", scaleBy: 100 },
    { column: "motor_3", label: "M3", color: "#f472b6", scaleBy: 100 },
    { column: "motor_4", label: "M4", color: "#a3e635", scaleBy: 100 },
  ],
  axes: [{ scale: "pct", unit: "%", side: "left", range: [0, 100] }],
};

const BATTERY: ChartSpec = {
  series: [
    { column: "bat_v", label: "pack", color: "#10b981", scale: "volts" },
    { column: "bat_a", label: "current", color: "#f5a524", scale: "amps" },
  ],
  axes: [
    { scale: "volts", unit: "V", side: "left" },
    { scale: "amps", unit: "A", side: "right" },
  ],
};

export const TelemetryPanel = () => (
  <div className="flex flex-col gap-2.5">
    <ChartCard title="ATTITUDE VS SETPOINT" unit="deg" spec={ATTITUDE} digits={1} />
    <ChartCard title="MOTOR OUTPUTS" unit="% command" spec={MOTORS} digits={0} />
    <ChartCard title="BATTERY" unit="V · A" spec={BATTERY} digits={2} />
    <SpectrumCard />
  </div>
);
