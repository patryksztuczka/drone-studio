import { LayoutPartId } from "@drone-studio/engine-client";
import type { LayoutPad } from "@drone-studio/engine-client";
import { describe, expect, it } from "vite-plus/test";

import { frequencyLabel, highlightFor, padEdge, padFunction, toBoard } from "./board-geometry.ts";
import type { BoardParts } from "./board-geometry.ts";

const id = (name: string) => LayoutPartId.make(name);

const pad = (name: string, kind: string, net: string): LayoutPad => ({
  id: id(name),
  kind,
  label: name.toUpperCase(),
  net,
  x_mm: 0,
  y_mm: 0,
});

const motorPad = pad("m1", "motor", "PB0");

const rxPad = pad("rx_rx", "uart", "PA10");

const groundPad = pad("bat_n", "power", "GND");

const board: BoardParts = {
  motor_outputs: [{ id: id("m1"), pin: "PB0", timer: "tim3", channel: 3 }],
  buses: [
    {
      id: id("serial_rx"),
      kind: "uart",
      peripheral: "usart1",
      frequency_hz: 420_000,
      devices: [],
      pins: [
        { pin: "PA10", role: "rx" },
        { pin: "PA9", role: "tx" },
      ],
    },
    {
      id: id("spi1"),
      kind: "spi",
      peripheral: "spi1",
      frequency_hz: 24_000_000,
      devices: [id("imu0")],
      pins: [{ pin: "PA5", role: "sck" }],
    },
  ],
  devices: [
    {
      id: id("imu0"),
      name: "ICM-42688-P",
      type: "imu",
      bus: id("spi1"),
      address: null,
      chip_select: "PC15",
      interrupt: "PB2",
      identity: { register: 117, value: 71 },
      position_mm: [1.5, -2],
      size_mm: [3, 2.5],
    },
  ],
  pads: [motorPad, rxPad, groundPad, pad("gnd2", "power", "GND")],
};

describe("board geometry", () => {
  it("draws the board with the nose up and the right side to the right", () => {
    expect(toBoard(10, 2)).toEqual({ x: 2, y: -10 });
  });

  it("puts each pad on the board edge it sits nearest", () => {
    expect(padEdge(11.5, -3)).toBe("front");
    expect(padEdge(-2.5, -11.5)).toBe("left");
    expect(padEdge(0, 11.8)).toBe("right");
    expect(padEdge(-11, 2)).toBe("rear");
  });

  it("lights the pads and devices of a bus on hover", () => {
    expect([...highlightFor(board, { kind: "bus", id: "serial_rx" }).pads]).toEqual(["rx_rx"]);
    expect([...highlightFor(board, { kind: "bus", id: "spi1" }).devices]).toEqual(["imu0"]);
  });

  it("lights every pad on the same net, and names what a pad does", () => {
    expect([...highlightFor(board, { kind: "pad", id: "bat_n" }).pads]).toEqual(["bat_n", "gnd2"]);
    expect(padFunction(board, motorPad)).toBe("TIM3 channel 3 → ESC M1");
    expect(padFunction(board, rxPad)).toBe("USART1 RX (serial_rx)");
    expect(padFunction(board, groundPad)).toBe("ground");
  });

  it("prints bus clocks in the unit a datasheet would use", () => {
    expect(frequencyLabel(24_000_000)).toBe("24 MHz");
    expect(frequencyLabel(400_000)).toBe("400 kHz");
  });
});
