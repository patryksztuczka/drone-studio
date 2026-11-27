import { boardLayout } from "@drone-studio/engine-client";
import type { AirframeId, BoardLayout, LayoutPad } from "@drone-studio/engine-client";
import { PillButton } from "@drone-studio/ui/components/pill";
import { useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { useState } from "react";

import { currentAirframe } from "../../../shared/studio.atoms.ts";
import { useElementSize } from "../../../shared/use-element-size.ts";
import type { ElementSize } from "../../../shared/use-element-size.ts";
import { busChips, highlightFor, padFunction } from "../board-geometry.ts";
import type { Selection } from "../board-geometry.ts";
import { fitBoard, isoPoint } from "../isometric.ts";
import type { IsoFrame } from "../isometric.ts";
import { AirframeCard } from "./airframe-card.tsx";
import { ComponentCard } from "./component-card.tsx";
import { IsoBoard, partTop } from "./iso-board.tsx";
import type { BoardPart } from "./iso-board.tsx";

const TOP = 64;

const BOTTOM = 160;

const CARD_INSET = 96;

const CARD_TOP = 104;

const COMPONENT_CARD_WIDTH = 224;

const SIDE_CLEARANCE = 360;

export const boardFrame = (board: BoardLayout["board"], size: ElementSize): IsoFrame => {
  const stage = size.height - TOP - BOTTOM;

  return {
    cx: size.width / 2,
    cy: TOP + stage / 2 + 8,
    scale: fitBoard(
      board.size_mm[0],
      board.thickness_mm,
      Math.max(size.width - SIDE_CLEARANCE * 2, 240),
      stage * 0.8,
    ),
  };
};

const sameSelection = (a: Selection | undefined, b: Selection) =>
  a !== undefined && a.kind === b.kind && a.id === b.id;

interface PartTagProps {
  readonly x: number;
  readonly y: number;
  readonly kind: string;
  readonly name: string;
  readonly onSelect: () => void;
}

const PartTag = ({ x, y, kind, name, onSelect }: PartTagProps) => (
  <button
    type="button"
    onClick={onSelect}
    className="absolute flex -translate-x-1/2 cursor-pointer items-center gap-2 border border-line-strong bg-surface px-2.5 py-[5px] font-label text-[12px] leading-4 whitespace-nowrap hover:border-blue"
    style={{ left: x, top: y }}
  >
    <span className="text-muted">{kind}</span>
    <span className="text-ink">{name}</span>
  </button>
);

const chipName = (name: string) => name.split(" ").at(-1) ?? name;

interface LoadedHardwareProps {
  readonly layout: BoardLayout;
  readonly size: ElementSize;
}

const LoadedHardware = ({ layout, size }: LoadedHardwareProps) => {
  const board = layout.board;
  const [part, setPart] = useState<BoardPart>(board.devices[0]?.id ?? "mcu");
  const [hover, setHover] = useState<Selection | undefined>(undefined);
  const [locked, setLocked] = useState<Selection | undefined>(undefined);
  const [pad, setPad] = useState<LayoutPad | undefined>(undefined);
  const active = hover ?? locked;
  const lit = highlightFor(board, active);
  const chips = busChips(board);
  const frame = boardFrame(board, size);
  const anchor = partTop(board, frame, part);
  const cardLeft = size.width - CARD_INSET - COMPONENT_CARD_WIDTH;
  const leaderY = CARD_TOP + 86;
  const activeChip = chips.find((chip) => sameSelection(active, chip.selection));
  const top = board.thickness_mm / 2;

  const tags: ReadonlyArray<{
    readonly id: BoardPart;
    readonly kind: string;
    readonly name: string;
  }> = [
    { id: "mcu", kind: "MCU", name: chipName(board.mcu.name).replace(/VIT6$/, "") },
    ...board.devices.map((device) => ({
      id: device.id,
      kind: device.type === "imu" ? "IMU" : "BARO",
      name: chipName(device.name),
    })),
  ];

  const footOf = (id: BoardPart) => {
    if (id === "mcu") {
      const mcu = board.mcu;

      const corner = isoPoint(
        frame,
        mcu.position_mm[0] - mcu.size_mm[0] / 2,
        mcu.position_mm[1] - mcu.size_mm[1] / 2,
        top,
      );

      return { x: corner.x - 70, y: corner.y + 8 };
    }

    const device = board.devices.find((candidate) => candidate.id === id);

    return device === undefined
      ? isoPoint(frame, 0, 0, top)
      : isoPoint(
          frame,
          device.position_mm[0] - device.size_mm[0] / 2,
          device.position_mm[1] + device.size_mm[1] / 2,
          top,
        );
  };

  const padPoint =
    pad === undefined ? undefined : isoPoint(frame, pad.x_mm, pad.y_mm, board.thickness_mm / 2);

  return (
    <>
      <svg
        width={size.width}
        height={size.height}
        className="absolute inset-0"
        role="img"
        aria-label={`${board.name}, isometric`}
      >
        <IsoBoard
          board={board}
          frame={frame}
          tone="blue"
          lit={lit}
          selected={part}
          onSelect={setPart}
          onPad={setPad}
        />
        <path
          d={`M${String(cardLeft)} ${String(leaderY)}H${String(cardLeft - 110)}L${anchor.x.toFixed(1)} ${anchor.y.toFixed(1)}`}
          fill="none"
          stroke="#0a6cff99"
          strokeDasharray="3 4"
          pointerEvents="none"
        />
        <circle
          cx={anchor.x}
          cy={anchor.y}
          r={3.5}
          fill="#ffffff"
          stroke="#0a6cff"
          pointerEvents="none"
        />
      </svg>
      {tags.flatMap((tag) => {
        if (tag.id === part) return [];

        const foot = footOf(tag.id);

        return [
          <PartTag
            key={tag.id}
            x={foot.x}
            y={foot.y + 12}
            kind={tag.kind}
            name={tag.name}
            onSelect={() => setPart(tag.id)}
          />,
        ];
      })}
      {pad === undefined || padPoint === undefined ? null : (
        <p
          aria-live="polite"
          className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-[calc(100%+10px)] items-center gap-2 border border-blue bg-surface px-2.5 py-[5px] font-label text-[12px] leading-4 whitespace-nowrap"
          style={{ left: padPoint.x, top: padPoint.y }}
        >
          <span className="text-blue">{pad.label}</span>
          <span className="text-ink">{pad.net}</span>
          <span className="text-muted">{padFunction(board, pad)}</span>
        </p>
      )}
      <div className="absolute top-[104px] left-24">
        <AirframeCard layout={layout} />
      </div>
      <div className="absolute top-[104px] right-24">
        <ComponentCard board={board} part={part} />
      </div>
      <footer
        aria-label="Board"
        className="absolute inset-x-16 bottom-0 flex h-40 items-center justify-between gap-6"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-[15px] leading-[18px] text-ink">Generated from one manifest</p>
          <p className="truncate font-label text-[12px] leading-4 text-faint">
            {activeChip === undefined
              ? `hardware/boards/${board.id}.yaml · codegen ${layout.source_hash?.slice(0, 8) ?? "output"}`
              : activeChip.detail}
          </p>
        </div>
        <div className="flex shrink-0 gap-2" role="group" aria-label="Buses">
          {chips.map((chip) => {
            const on = sameSelection(active, chip.selection);

            return (
              <PillButton
                key={chip.label}
                tone={on ? "blue" : "neutral"}
                aria-pressed={sameSelection(locked, chip.selection)}
                onPointerEnter={() => setHover(chip.selection)}
                onPointerLeave={() => setHover(undefined)}
                onFocus={() => setHover(chip.selection)}
                onBlur={() => setHover(undefined)}
                onClick={() =>
                  setLocked(sameSelection(locked, chip.selection) ? undefined : chip.selection)
                }
              >
                {chip.label}
              </PillButton>
            );
          })}
        </div>
      </footer>
    </>
  );
};

const ForAirframe = ({
  airframe,
  size,
}: {
  readonly airframe: AirframeId;
  readonly size: ElementSize;
}) => {
  const layout = useAtomValue(boardLayout(airframe));

  if (!AsyncResult.isSuccess(layout)) {
    return (
      <p className="absolute inset-0 flex items-center justify-center font-label text-[12px] text-faint">
        reading board_layout.json
      </p>
    );
  }

  return <LoadedHardware layout={layout.value} size={size} />;
};

export const HardwareModule = () => {
  const airframe = useAtomValue(currentAirframe);
  const { element, size } = useElementSize<HTMLDivElement>();

  return (
    <section ref={element} aria-label="Hardware" className="absolute inset-0">
      {airframe === undefined || size.width === 0 ? null : (
        <ForAirframe airframe={airframe} size={size} />
      )}
    </section>
  );
};
