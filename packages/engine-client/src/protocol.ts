import { Schema } from "effect";

export const RunId = Schema.String.pipe(Schema.brand("RunId"));

export type RunId = typeof RunId.Type;

export const ScenarioId = Schema.String.pipe(Schema.brand("ScenarioId"));

export type ScenarioId = typeof ScenarioId.Type;

export const AirframeId = Schema.String.pipe(Schema.brand("AirframeId"));

export type AirframeId = typeof AirframeId.Type;

export const CatalogItemId = Schema.String.pipe(Schema.brand("CatalogItemId"));

export type CatalogItemId = typeof CatalogItemId.Type;

export const LayoutPartId = Schema.String.pipe(Schema.brand("LayoutPartId"));

export type LayoutPartId = typeof LayoutPartId.Type;

const Vector3 = Schema.Tuple([Schema.Number, Schema.Number, Schema.Number]);

const Vector2 = Schema.Tuple([Schema.Number, Schema.Number]);

export const Scenario = Schema.Struct({
  id: ScenarioId,
  name: Schema.String,
  description: Schema.String,
  tags: Schema.Array(Schema.String),
  duration_s: Schema.Number,
  airframe: AirframeId,
});

export type Scenario = typeof Scenario.Type;

export const SticksMode = Schema.Literals(["angle", "althold"]);

export type SticksMode = typeof SticksMode.Type;

export const Sticks = Schema.Struct({
  roll: Schema.Number,
  pitch: Schema.Number,
  yaw: Schema.Number,
  throttle: Schema.Number,
  arm: Schema.Boolean,
  mode: SticksMode,
});

export type Sticks = typeof Sticks.Type;

export const SessionMode = Schema.Literals(["scenario", "manual"]);

export type SessionMode = typeof SessionMode.Type;

export const SessionStatus = Schema.Struct({
  session_id: Schema.Number,
  mode: SessionMode,
  scenario: Schema.String,
  t: Schema.Number,
  duration_s: Schema.Number,
  speed: Schema.Number,
  paused: Schema.Boolean,
  finished: Schema.Boolean,
  rc: Sticks,
});

export type SessionStatus = typeof SessionStatus.Type;

export const EngineInfo = Schema.Struct({
  engine: Schema.Struct({ name: Schema.String, version: Schema.String, url: Schema.String }),
  airframes: Schema.Array(AirframeId),
  scenarios: Schema.Array(Scenario),
  frame: Schema.Struct({
    kind: Schema.Number,
    header_bytes: Schema.Number,
    columns: Schema.Array(Schema.String),
    rate_hz: Schema.Number,
  }),
  params: Schema.Array(Schema.String),
  live: Schema.NullOr(SessionStatus),
});

export type EngineInfo = typeof EngineInfo.Type;

export const FlightEvent = Schema.Struct({
  t: Schema.Number,
  kind: Schema.String,
  data: Schema.optional(Schema.Unknown),
});

export type FlightEvent = typeof FlightEvent.Type;

export const Assertion = Schema.Struct({
  kind: Schema.String,
  limit: Schema.String,
  measured: Schema.NullOr(Schema.Number),
  message: Schema.String,
  passed: Schema.Boolean,
});

export type Assertion = typeof Assertion.Type;

export const RunMetrics = Schema.Struct({
  duration_s: Schema.Number,
  max_tilt_deg: Schema.Number,
  attitude_error_rms_deg: Schema.Number,
  altitude_error_rms_m: Schema.Number,
  min_battery_v: Schema.Number,
  max_current_a: Schema.Number,
  saturation_pct: Schema.Number,
  max_height_m: Schema.Number,
  failsafe: Schema.Boolean,
});

export type RunMetrics = typeof RunMetrics.Type;

export const RunResult = Schema.Literals(["PASS", "FAIL"]);

export type RunResult = typeof RunResult.Type;

export const RunSummary = Schema.Struct({
  run_id: RunId,
  created_at: Schema.String,
  scenario: ScenarioId,
  scenario_name: Schema.String,
  result: RunResult,
  source: Schema.String,
  seed: Schema.Number,
  params: Schema.Record(Schema.String, Schema.Number),
  duration_s: Schema.Number,
  metrics: RunMetrics,
  assertions: Schema.Array(Assertion),
});

export type RunSummary = typeof RunSummary.Type;

export const RunList = Schema.Struct({ runs: Schema.Array(RunSummary) });

export const Anomaly = Schema.Struct({
  kind: Schema.String,
  channel: Schema.String,
  detail: Schema.String,
  severity: Schema.String,
  t_start: Schema.Number,
  t_end: Schema.Number,
});

export type Anomaly = typeof Anomaly.Type;

export const LoadedRunPayload = Schema.Struct({
  meta: Schema.Struct({
    run_id: RunId,
    result: RunResult,
    seed: Schema.Number,
    source: Schema.String,
    scenario: Schema.Struct({ id: ScenarioId, name: Schema.String, duration_s: Schema.Number }),
  }),
  events: Schema.Array(FlightEvent),
  anomalies: Schema.Array(Anomaly),
  t: Schema.Array(Schema.Number),
  columns: Schema.Record(Schema.String, Schema.Array(Schema.Number)),
});

export type LoadedRunPayload = typeof LoadedRunPayload.Type;

export const Spectrum = Schema.Struct({
  freq_hz: Schema.Array(Schema.Number),
  accel_z: Schema.Array(Schema.Number),
  gyro_x: Schema.Array(Schema.Number),
});

export type Spectrum = typeof Spectrum.Type;

const LayoutComponent = Schema.Struct({
  id: LayoutPartId,
  mass_g: Schema.Number,
  position_m: Vector3,
  size_m: Vector3,
});

const Hotspot = Schema.Struct({
  id: LayoutPartId,
  kind: Schema.String,
  label: Schema.String,
  position_m: Vector3,
});

const Rotor = Schema.Struct({
  id: LayoutPartId,
  position_m: Vector3,
  spin: Schema.Literals(["cw", "ccw"]),
  output: Schema.Struct({ channel: Schema.Number, pin: Schema.String, timer: Schema.String }),
});

const BusPin = Schema.Struct({ pin: Schema.String, role: Schema.String });

const Bus = Schema.Struct({
  id: LayoutPartId,
  kind: Schema.String,
  peripheral: Schema.String,
  frequency_hz: Schema.Number,
  devices: Schema.Array(LayoutPartId),
  pins: Schema.Array(BusPin),
});

const Device = Schema.Struct({
  id: LayoutPartId,
  name: Schema.String,
  type: Schema.String,
  bus: LayoutPartId,
  address: Schema.NullOr(Schema.Number),
  chip_select: Schema.NullOr(Schema.String),
  interrupt: Schema.NullOr(Schema.String),
  identity: Schema.Struct({ register: Schema.Number, value: Schema.Number }),
  position_mm: Vector2,
  size_mm: Vector2,
});

const Pad = Schema.Struct({
  id: LayoutPartId,
  kind: Schema.String,
  label: Schema.String,
  net: Schema.String,
  x_mm: Schema.Number,
  y_mm: Schema.Number,
});

const MotorOutput = Schema.Struct({
  id: LayoutPartId,
  pin: Schema.String,
  timer: Schema.String,
  channel: Schema.Number,
});

export const Performance = Schema.Struct({
  hover_current_a: Schema.Number,
  hover_thrust_fraction: Schema.Number,
  hover_thrust_per_rotor_n: Schema.Number,
  hover_time_min: Schema.Number,
  max_thrust_per_rotor_n: Schema.Number,
  thrust_to_weight: Schema.Number,
  weight_n: Schema.Number,
});

export type Performance = typeof Performance.Type;

export const BoardLayout = Schema.Struct({
  airframe: Schema.Struct({
    id: AirframeId,
    name: Schema.String,
    description: Schema.String,
    mass_g: Schema.Number,
    wheelbase_mm: Schema.Number,
    prop_diameter_m: Schema.Number,
    frame_size_m: Vector3,
    center_of_mass_m: Vector3,
    colors: Schema.Struct({ accent: Schema.String, ducts: Schema.String, frame: Schema.String }),
    components: Schema.Array(LayoutComponent),
    components_selected: Schema.Record(Schema.String, CatalogItemId),
    hotspots: Schema.Array(Hotspot),
    rotors: Schema.Array(Rotor),
  }),
  board: Schema.Struct({
    id: LayoutPartId,
    name: Schema.String,
    size_mm: Vector2,
    thickness_mm: Schema.Number,
    mcu: Schema.Struct({
      id: LayoutPartId,
      name: Schema.String,
      core: Schema.String,
      clock_hz: Schema.Number,
      position_mm: Vector2,
      size_mm: Vector2,
    }),
    buses: Schema.Array(Bus),
    devices: Schema.Array(Device),
    pads: Schema.Array(Pad),
    motor_outputs: Schema.Array(MotorOutput),
    mounting_holes_mm: Schema.Array(Vector2),
  }),
  performance: Performance,
});

export type BoardLayout = typeof BoardLayout.Type;

export type LayoutRotor = typeof Rotor.Type;

export type LayoutComponent = typeof LayoutComponent.Type;

export type LayoutHotspot = typeof Hotspot.Type;

export type LayoutBus = typeof Bus.Type;

export type LayoutDevice = typeof Device.Type;

export type LayoutPad = typeof Pad.Type;

const CatalogItem = Schema.Struct({
  id: CatalogItemId,
  name: Schema.String,
  mass_g: Schema.Number,
});

export const HardwareCatalog = Schema.Struct({
  batteries: Schema.Array(CatalogItem),
  motors: Schema.Array(CatalogItem),
  props: Schema.Array(CatalogItem),
  frames: Schema.Array(CatalogItem),
});

export type HardwareCatalog = typeof HardwareCatalog.Type;

export type CatalogItem = typeof CatalogItem.Type;

export const PartSelection = Schema.Struct({
  battery: CatalogItemId,
  motor: CatalogItemId,
  prop: CatalogItemId,
  frame: CatalogItemId,
});

export type PartSelection = typeof PartSelection.Type;

export const HardwarePreview = Schema.Struct({
  selection: PartSelection,
  mass_g: Schema.Number,
  baseline_mass_g: Schema.Number,
  center_of_mass_m: Vector3,
  performance: Performance,
  baseline_performance: Performance,
  full_throttle_current_a: Schema.Number,
  warnings: Schema.Array(Schema.String),
  simulated_firmware_matches: Schema.Boolean,
});

export type HardwarePreview = typeof HardwarePreview.Type;

export const EmuStatus = Schema.Struct({
  docker: Schema.NullOr(Schema.String),
  elf_built: Schema.Boolean,
  repl: Schema.Boolean,
  last_smoke: Schema.NullOr(Schema.Unknown),
  hint: Schema.String,
});

export type EmuStatus = typeof EmuStatus.Type;

export const RealStatus = Schema.Struct({
  connected: Schema.Boolean,
  policy: Schema.String,
  detail: Schema.String,
});

export type RealStatus = typeof RealStatus.Type;

export const SessionStopped = Schema.Struct({
  stopped: Schema.Boolean,
  run_id: Schema.NullOr(RunId),
  result: Schema.NullOr(RunResult),
  assertions: Schema.Array(Assertion),
});

export type SessionStopped = typeof SessionStopped.Type;

export const SessionEvents = Schema.Struct({
  session_id: Schema.Number,
  events: Schema.Array(FlightEvent),
});

export const LiveSpectrum = Schema.Struct({
  session_id: Schema.Number,
  freq_hz: Schema.Array(Schema.Number),
  accel_z: Schema.Array(Schema.Number),
  gyro_x: Schema.Array(Schema.Number),
});

export const FocusRequest = Schema.Struct({ run_id: RunId, t: Schema.NullOr(Schema.Number) });

export type FocusRequest = typeof FocusRequest.Type;

export const EngineError = Schema.Struct({ message: Schema.String });
