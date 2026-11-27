import type { SampleTable } from "@drone-studio/engine-client";

import { poseAt } from "./flight-pose.ts";
import type { FlightPose } from "./flight-pose.ts";
import { nedToScene } from "./frames-of-reference.ts";

export interface PoseSource {
  readonly table: SampleTable;
  readonly t: number;
}

export class PoseSampler {
  private stamp = Number.NaN;
  private pose: FlightPose | undefined;
  private readonly source: () => PoseSource | undefined;
  private readonly fallback: FlightPose | undefined;

  constructor(source: () => PoseSource | undefined, fallback: FlightPose | undefined) {
    this.source = source;
    this.fallback = fallback;
  }

  read(stamp: number): FlightPose | undefined {
    if (stamp === this.stamp) return this.pose;

    this.stamp = stamp;

    const source = this.source();

    this.pose =
      source === undefined || source.table.length === 0
        ? this.fallback
        : poseAt(source.table, source.t);

    return this.pose;
  }

  trail(stamp: number, seconds: number, points: number): ReadonlyArray<FlightPose["position"]> {
    const source = this.source();

    if (source === undefined || source.table.length === 0 || stamp < 0) return [];

    const start = Math.max(source.table.startTime, source.t - seconds);
    const step = (source.t - start) / Math.max(points - 1, 1);

    return Array.from({ length: points }, (_, index) => {
      const t = start + step * index;

      return nedToScene(
        source.table.sample("pos_n", t),
        source.table.sample("pos_e", t),
        source.table.sample("pos_d", t),
      );
    });
  }
}
