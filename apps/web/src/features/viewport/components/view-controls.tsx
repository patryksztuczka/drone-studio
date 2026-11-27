import { useAtom } from "@effect/atom-react";
import { Option } from "effect";

import { FollowIcon, GhostIcon, OrbitIcon, XrayIcon } from "../../../shared/icons.tsx";
import { Segmented } from "../../../shared/segmented.tsx";
import { cameraMode, ghostRun, viewMode } from "../../../shared/studio.atoms.ts";
import type { CameraMode, ViewMode } from "../../../shared/studio.atoms.ts";

export const ViewControls = () => {
  const [mode, setMode] = useAtom(viewMode);
  const [camera, setCamera] = useAtom(cameraMode);
  const [ghost, setGhost] = useAtom(ghostRun);

  return (
    <div className="absolute top-3 right-3 flex items-center gap-2">
      {Option.isSome(ghost) ? (
        <button
          type="button"
          onClick={() => setGhost(Option.none())}
          className="flex h-7 items-center gap-1.5 rounded-md border border-ghost/40 bg-[#0b0e14b3] px-2.5 text-[11px] text-ghost backdrop-blur hover:bg-[#a78bfa1a]"
          title="Remove the ghost run"
        >
          <GhostIcon width={13} height={13} />
          Ghost diff on
        </button>
      ) : null}
      <Segmented<ViewMode>
        label="View"
        value={mode}
        onChange={setMode}
        className="bg-[#0b0e14b3] backdrop-blur"
        options={[
          { value: "studio", label: "Studio", title: "Clean model (X toggles)" },
          {
            value: "xray",
            label: (
              <>
                <XrayIcon width={12} height={12} />
                X-Ray
              </>
            ),
            title: "Translucent frame, thrust vectors, centre of mass, attitude target (X)",
          },
        ]}
      />
      <Segmented<CameraMode>
        label="Camera"
        value={camera}
        onChange={setCamera}
        className="bg-[#0b0e14b3] backdrop-blur"
        options={[
          {
            value: "follow",
            label: (
              <>
                <FollowIcon width={12} height={12} />
                Follow
              </>
            ),
            title: "Keep the drone in the centre (C)",
          },
          {
            value: "orbit",
            label: (
              <>
                <OrbitIcon width={12} height={12} />
                Orbit
              </>
            ),
            title: "Free orbit around a fixed point (C)",
          },
        ]}
      />
    </div>
  );
};
