import { RegistryContext } from "@effect/atom-react";
import { Option } from "effect";
import { useContext, useEffect, useRef } from "react";

import {
  activeFlight,
  cameraMode,
  inspectorTab,
  manualFlightActive,
  playhead,
  showcase,
  viewMode,
} from "../../../shared/studio.atoms.ts";
import type { Transport } from "../../../shared/transport.ts";
import { seekTo } from "../../time-machine/index.ts";
import { hotkeyAction } from "../hotkeys.ts";
import type { HotkeyAction } from "../hotkeys.ts";

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLSelectElement ||
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLElement && target.isContentEditable);

export const useHotkeys = (transport: Transport) => {
  const registry = useContext(RegistryContext);
  const latest = useRef(transport);

  useEffect(() => {
    latest.current = transport;
  });

  useEffect(() => {
    const seek = (direction: -1 | 1, coarse: boolean) =>
      Option.map(registry.get(activeFlight), (flight) => {
        const t = registry.get(playhead) + direction * (coarse ? 1 : 0.1);

        seekTo(registry, Math.min(Math.max(t, flight.table.startTime), flight.table.endTime));
      });

    const perform = (action: HotkeyAction, coarse: boolean) => {
      const actions: Readonly<Record<HotkeyAction, () => void>> = {
        "toggle-play": () => latest.current.toggle(),
        reset: () => latest.current.reset(),
        xray: () => registry.set(viewMode, registry.get(viewMode) === "xray" ? "studio" : "xray"),
        showcase: () => registry.set(showcase, !registry.get(showcase)),
        "leave-showcase": () => registry.set(showcase, false),
        camera: () =>
          registry.set(cameraMode, registry.get(cameraMode) === "follow" ? "orbit" : "follow"),
        live: () => latest.current.goLive(),
        "seek-back": () => seek(-1, coarse),
        "seek-forward": () => seek(1, coarse),
        "tab-hardware": () => registry.set(inspectorTab, "hardware"),
        "tab-telemetry": () => registry.set(inspectorTab, "telemetry"),
        "tab-runs": () => registry.set(inspectorTab, "runs"),
      };

      actions[action]();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;

      const action = hotkeyAction(event.key, { manualFlight: registry.get(manualFlightActive) });

      if (
        action === undefined ||
        (event.repeat && action !== "seek-back" && action !== "seek-forward")
      )
        return;

      event.preventDefault();
      perform(action, event.shiftKey);
    };

    globalThis.addEventListener("keydown", onKeyDown);

    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, [registry]);
};
