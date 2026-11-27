import type { BoardLayout } from "@drone-studio/engine-client";
import { Dot } from "@drone-studio/ui/components/pill";
import {
  CardBody,
  CardHeader,
  CardRow,
  SchematicCard,
} from "@drone-studio/ui/components/schematic-card";
import { useAtomValue } from "@effect/atom-react";
import { Option } from "effect";

import { activeFlight, playhead } from "../../../shared/studio.atoms.ts";
import { frequencyLabel } from "../board-geometry.ts";
import { recentValues, sparkPath } from "../sparkline.ts";
import type { BoardPart } from "./iso-board.tsx";

const GYRO_CALIBRATED = 1 << 0;

const IMU_FAULT = 1 << 7;

const SPARK_WIDTH = 194;

const SPARK_HEIGHT = 36;

const LABELS: ReadonlyMap<string, string> = new Map([
  ["imu", "IMU"],
  ["barometer", "BARO"],
]);

const TRACES: ReadonlyMap<string, readonly [string, string]> = new Map([
  ["imu", ["imu_gx", "imu_az"]],
  ["barometer", ["baro_pa", "height"]],
]);

const hex = (value: number) => `0x${value.toString(16)}`;

const chipName = (name: string) => name.split(" ").at(-1) ?? name;

interface ComponentCardProps {
  readonly board: BoardLayout["board"];
  readonly part: BoardPart;
}

export const ComponentCard = ({ board, part }: ComponentCardProps) => {
  const flight = useAtomValue(activeFlight);
  const t = useAtomValue(playhead);
  const device = board.devices.find((candidate) => candidate.id === part);
  const bus = board.buses.find((candidate) => candidate.id === device?.bus);

  const series = (column: string) =>
    Option.match(flight, {
      onNone: () => [],
      onSome: (view) => recentValues(view.table, column, t, 3, 80),
    });

  const status = Option.match(flight, {
    onNone: () => Number.NaN,
    onSome: (view) => view.table.sample("status", t),
  });

  const streaming = Number.isFinite(status);

  const imuHealthy =
    (Math.round(status) & IMU_FAULT) === 0 && (Math.round(status) & GYRO_CALIBRATED) !== 0;

  const healthy = device?.type === "imu" ? imuHealthy : true;

  if (device === undefined) {
    const mcu = board.mcu;
    const timers = [...new Set(board.motor_outputs.map((output) => output.timer.toUpperCase()))];

    return (
      <SchematicCard aria-label="MCU" className="w-[224px] border-blue">
        <CardHeader title={<span className="text-blue">MCU</span>} aside={chipName(mcu.name)} />
        <CardBody>
          <CardRow label="core">{mcu.core}</CardRow>
          <CardRow label="clock">{frequencyLabel(mcu.clock_hz)}</CardRow>
          <CardRow label="outputs">
            {timers.join(" / ")} · {String(board.motor_outputs.length)}
          </CardRow>
          <CardRow label="buses">{String(board.buses.length)}</CardRow>
        </CardBody>
      </SchematicCard>
    );
  }

  const label = LABELS.get(device.type) ?? device.type.toUpperCase();
  const [noisyColumn, smoothColumn] = TRACES.get(device.type) ?? ["baro_pa", "height"];
  const noisy = series(noisyColumn);
  const smooth = series(smoothColumn);

  return (
    <SchematicCard aria-label={label} className="w-[224px] border-blue">
      <CardHeader
        title={<span className="text-blue">{label}</span>}
        aside={chipName(device.name)}
      />
      <CardBody>
        <CardRow label="bus">
          {bus === undefined
            ? device.bus.toUpperCase()
            : `${bus.peripheral.toUpperCase()} ${frequencyLabel(bus.frequency_hz)}`}
        </CardRow>
        {device.chip_select === null ? (
          <CardRow label="address">{device.address === null ? "–" : hex(device.address)}</CardRow>
        ) : (
          <CardRow label="cs / int">
            {device.chip_select} / {device.interrupt ?? "–"}
          </CardRow>
        )}
        <CardRow label={device.identity.register === 0 ? "CHIP_ID" : "WHO_AM_I"}>
          <span className="inline-flex items-center gap-1.5">
            <Dot tone={streaming ? (healthy ? "ok" : "fail") : "faint"} />
            {hex(device.identity.value)}
          </span>
        </CardRow>
      </CardBody>
      <div className="border-t border-line px-3.5 pt-2.5 pb-3">
        <svg
          width={SPARK_WIDTH}
          height={SPARK_HEIGHT}
          viewBox={`0 0 ${String(SPARK_WIDTH)} ${String(SPARK_HEIGHT)}`}
          role="img"
          aria-label={streaming ? "Last three seconds of samples" : "No samples yet"}
        >
          <path d={sparkPath(noisy, SPARK_WIDTH, SPARK_HEIGHT)} fill="none" stroke="#c8c8c8" />
          <path
            d={sparkPath(smooth, SPARK_WIDTH, SPARK_HEIGHT)}
            fill="none"
            stroke="#0a6cff"
            strokeWidth={1.4}
          />
        </svg>
      </div>
    </SchematicCard>
  );
};
