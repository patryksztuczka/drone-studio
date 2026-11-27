import { CatalogItemId } from "@drone-studio/engine-client";
import type { HardwarePreview, Performance } from "@drone-studio/engine-client";
import { describe, expect, it } from "vite-plus/test";

import { previewRows } from "./preview-deltas.ts";

const performance = (twr: number, hover: number): Performance => ({
  hover_current_a: 6.1,
  hover_thrust_fraction: 0.24,
  hover_thrust_per_rotor_n: 0.27,
  hover_time_min: hover,
  max_thrust_per_rotor_n: 1.12,
  thrust_to_weight: twr,
  weight_n: 1.09,
});

const preview = (mass: number, twr: number, hover: number): HardwarePreview => ({
  selection: {
    battery: CatalogItemId.make("2s_450mah_lipo"),
    motor: CatalogItemId.make("1202_5_8000kv"),
    prop: CatalogItemId.make("gemfan_2023_3blade"),
    frame: CatalogItemId.make("palm_95_ducted"),
  },
  mass_g: mass,
  baseline_mass_g: 111.4,
  center_of_mass_m: [0, 0, 0],
  performance: performance(twr, hover),
  baseline_performance: performance(4.11, 4.32),
  full_throttle_current_a: 25.6,
  warnings: [],
  simulated_firmware_matches: false,
});

describe("previewRows", () => {
  it("calls a lighter pack with more thrust to weight but less hover time what it is", () => {
    const rows = previewRows(preview(105.4, 4.32, 3.6));
    const byLabel = new Map(rows.map((entry) => [entry.label, entry]));

    expect(byLabel.get("All-up mass")).toMatchObject({ verdict: "better" });
    expect(byLabel.get("All-up mass")?.delta).toBeCloseTo(-6);
    expect(byLabel.get("Thrust to weight")).toMatchObject({ verdict: "better" });
    expect(byLabel.get("Hover time")).toMatchObject({ verdict: "worse" });
  });

  it("reports no change below the shown precision", () => {
    const rows = previewRows(preview(111.42, 4.111, 4.32));

    expect(rows.find((entry) => entry.label === "All-up mass")?.verdict).toBe("same");
    expect(rows.find((entry) => entry.label === "Thrust to weight")?.verdict).toBe("same");
  });
});
