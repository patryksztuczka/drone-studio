import { boardLayout } from "@drone-studio/engine-client";
import type { AirframeId } from "@drone-studio/engine-client";
import { useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";

import { fixed } from "../../../shared/format.ts";
import { currentAirframe } from "../../../shared/studio.atoms.ts";
import { BoardView } from "./board-view.tsx";
import { PartsSwap } from "./parts-swap.tsx";

const Waiting = ({ children }: { readonly children: string }) => (
  <p className="px-5 py-6 font-label text-[11px] text-faint">{children}</p>
);

const LoadedInspector = ({ airframe }: { readonly airframe: AirframeId }) => {
  const layout = useAtomValue(boardLayout(airframe));

  if (!AsyncResult.isSuccess(layout)) return <Waiting>reading board_layout.json…</Waiting>;

  const frame = layout.value.airframe;

  return (
    <div className="flex flex-col">
      <header className="flex items-baseline justify-between px-5 pt-3.5 pb-1">
        <h2 className="text-[15px] leading-[18px] font-normal text-ink">{frame.name}</h2>
        <span className="shrink-0 font-label text-[11px] leading-[14px] text-faint">
          {fixed(frame.mass_g, 1)} g · {fixed(frame.wheelbase_mm, 0)} mm
        </span>
      </header>
      <p className="px-5 pb-2 text-[12px] leading-[18px] text-muted">{frame.description}</p>
      <BoardView layout={layout.value} />
      <PartsSwap layout={layout.value} />
    </div>
  );
};

export const HardwareInspector = () => {
  const airframe = useAtomValue(currentAirframe);

  if (airframe === undefined) return <Waiting>waiting for drone-engine…</Waiting>;

  return <LoadedInspector airframe={airframe} />;
};
