import { useAtom } from "@effect/atom-react";
import { Option } from "effect";

import { GhostIcon, ShowcaseIcon } from "../../../shared/icons.tsx";
import { Segmented } from "../../../shared/segmented.tsx";
import { cameraMode, ghostRun, showcase, viewMode } from "../../../shared/studio.atoms.ts";
import type { CameraMode, ViewMode } from "../../../shared/studio.atoms.ts";

export const ViewControls = () => {
  const [mode, setMode] = useAtom(viewMode);
  const [camera, setCamera] = useAtom(cameraMode);
  const [ghost, setGhost] = useAtom(ghostRun);
  const [, setShowcase] = useAtom(showcase);

  return (
    <div className="absolute top-5 right-5 z-10 flex items-center gap-2">
      <Segmented<ViewMode>
        label="View"
        value={mode}
        onChange={setMode}
        hint="X"
        options={[
          { value: "studio", label: "Studio", title: "Glass model (X toggles)" },
          {
            value: "xray",
            label: "X-Ray",
            title: "Thinner glass, thrust, centre of mass, setpoint and part callouts (X)",
          },
        ]}
      />
      <Segmented<CameraMode>
        label="Camera"
        value={camera}
        onChange={setCamera}
        hint="C"
        options={[
          { value: "follow", label: "Follow", title: "Keep the drone in the centre (C)" },
          { value: "orbit", label: "Orbit", title: "Orbit a fixed point (C)" },
        ]}
      />
      <button
        type="button"
        onClick={() => setShowcase(true)}
        title="Only the drone, for a demo (F)"
        className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[12px] leading-4 text-ink hover:border-ink"
      >
        <ShowcaseIcon />
        Showcase
        <kbd className="font-label text-[10px] leading-3 text-faint">F</kbd>
      </button>
      {Option.isSome(ghost) ? (
        <button
          type="button"
          onClick={() => setGhost(Option.none())}
          title="Remove the ghost run"
          className="flex cursor-pointer items-center gap-1.5 rounded-full border border-ghost bg-[#f3f0ff] px-3 py-1.5 text-[12px] leading-4 text-ghost"
        >
          <GhostIcon />
          Ghost diff on
          <span aria-hidden="true" className="text-[11px]">
            ×
          </span>
        </button>
      ) : null}
    </div>
  );
};
