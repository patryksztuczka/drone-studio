import { boardLayout } from "@drone-studio/engine-client";
import type { AirframeId } from "@drone-studio/engine-client";
import { useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";

import { fixed } from "../../../shared/format.ts";
import { currentAirframe } from "../../../shared/studio.atoms.ts";
import { BoardView } from "./board-view.tsx";
import { PartsSwap } from "./parts-swap.tsx";

const LoadedInspector = ({ airframe }: { readonly airframe: AirframeId }) => {
  const layout = useAtomValue(boardLayout(airframe));

  if (!AsyncResult.isSuccess(layout)) {
    return (
      <p className="py-6 text-center font-mono text-[11px] text-faint">
        Reading board_layout.json…
      </p>
    );
  }

  const frame = layout.value.airframe;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-[13px] font-semibold text-foreground">{frame.name}</h2>
          <p className="text-[11px] text-muted-foreground">{frame.description}</p>
        </div>
        <span className="shrink-0 font-mono text-[10px] text-faint">
          {fixed(frame.mass_g, 1)} g · {fixed(frame.wheelbase_mm, 0)} mm
        </span>
      </header>
      <BoardView layout={layout.value} />
      <PartsSwap layout={layout.value} />
    </div>
  );
};

export const HardwareInspector = () => {
  const airframe = useAtomValue(currentAirframe);

  if (airframe === undefined) {
    return (
      <p className="py-6 text-center font-mono text-[11px] text-faint">Waiting for drone-engine…</p>
    );
  }

  return <LoadedInspector airframe={airframe} />;
};
