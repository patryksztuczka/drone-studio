import type { BoardLayout, LayoutBus, LayoutPad } from "@drone-studio/engine-client";

export type BoardParts = Pick<
  BoardLayout["board"],
  "buses" | "devices" | "pads" | "motor_outputs" | "analog"
>;

export interface BoardPoint {
  readonly x: number;
  readonly y: number;
}

export const toBoard = (forwardMm: number, rightMm: number): BoardPoint => ({
  x: rightMm,
  y: -forwardMm,
});

export type Edge = "front" | "rear" | "left" | "right";

export const padEdge = (forwardMm: number, rightMm: number): Edge => {
  if (Math.abs(forwardMm) > Math.abs(rightMm)) return forwardMm > 0 ? "front" : "rear";

  return rightMm > 0 ? "right" : "left";
};

export type Selection =
  | { readonly kind: "pad"; readonly id: string }
  | { readonly kind: "bus"; readonly id: string }
  | { readonly kind: "device"; readonly id: string }
  | { readonly kind: "analog"; readonly id: string };

export interface Highlight {
  readonly pads: ReadonlySet<string>;
  readonly devices: ReadonlySet<string>;
  readonly buses: ReadonlySet<string>;
}

const NOTHING: Highlight = { pads: new Set(), devices: new Set(), buses: new Set() };

const busNets = (bus: LayoutBus) => new Set(bus.pins.map((pin) => pin.pin));

export const highlightFor = (board: BoardParts, selection: Selection | undefined): Highlight => {
  if (selection === undefined) return NOTHING;

  if (selection.kind === "bus") {
    const bus = board.buses.find((candidate) => candidate.id === selection.id);

    if (bus === undefined) return NOTHING;

    const nets = busNets(bus);

    return {
      buses: new Set([bus.id]),
      devices: new Set(bus.devices),
      pads: new Set(board.pads.filter((pad) => nets.has(pad.net)).map((pad) => pad.id)),
    };
  }

  if (selection.kind === "analog") {
    return {
      buses: new Set([selection.id]),
      devices: new Set(),
      pads: new Set(board.pads.filter((pad) => pad.net === "VBAT").map((pad) => pad.id)),
    };
  }

  if (selection.kind === "device") {
    const device = board.devices.find((candidate) => candidate.id === selection.id);

    return device === undefined
      ? NOTHING
      : { buses: new Set([device.bus]), devices: new Set([device.id]), pads: new Set() };
  }

  const pad = board.pads.find((candidate) => candidate.id === selection.id);

  if (pad === undefined) return NOTHING;

  const buses = board.buses.filter((bus) => busNets(bus).has(pad.net));
  const sameNet = board.pads.filter((other) => other.net === pad.net).map((other) => other.id);

  return { buses: new Set(buses.map((bus) => bus.id)), devices: new Set(), pads: new Set(sameNet) };
};

export const padFunction = (board: BoardParts, pad: LayoutPad) => {
  const output = board.motor_outputs.find((candidate) => candidate.pin === pad.net);

  if (output !== undefined) {
    return `${output.timer.toUpperCase()} channel ${String(output.channel)} → ESC ${output.id.toUpperCase()}`;
  }

  for (const bus of board.buses) {
    const pin = bus.pins.find((candidate) => candidate.pin === pad.net);

    if (pin !== undefined)
      return `${bus.peripheral.toUpperCase()} ${pin.role.toUpperCase()} (${bus.id})`;
  }

  if (pad.kind === "power") return pad.net === "GND" ? "ground" : `${pad.net} supply`;

  return pad.net;
};

export const frequencyLabel = (hz: number) => {
  if (hz >= 1_000_000) return `${String(hz / 1_000_000)} MHz`;

  if (hz >= 1000) return `${String(hz / 1000)} kHz`;

  return `${String(hz)} Hz`;
};

export interface BusChip {
  readonly selection: Selection;
  readonly label: string;
  readonly detail: string;
}

export const busChips = (board: BoardParts): ReadonlyArray<BusChip> => {
  const buses = board.buses.map((bus): BusChip => ({
    selection: { kind: "bus", id: bus.id },
    label: bus.peripheral.toUpperCase(),
    detail: [
      `${bus.peripheral.toUpperCase()} ${frequencyLabel(bus.frequency_hz)}`,
      ...bus.pins.map((pin) => `${pin.role.toUpperCase()} ${pin.pin}`),
    ].join(" · "),
  }));

  const analog = board.analog;

  if (analog === undefined) return buses;

  const adc = analog.vbat.adc;

  return [
    ...buses,
    {
      selection: { kind: "analog", id: adc },
      label: adc.toUpperCase(),
      detail: `${adc.toUpperCase()} · VBAT ch${String(analog.vbat.channel)} ${analog.vbat.pin} · current ch${String(analog.current.channel)} ${analog.current.pin}`,
    },
  ];
};
