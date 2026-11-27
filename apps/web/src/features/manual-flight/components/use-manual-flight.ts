import { sendSticks } from "@drone-studio/engine-client";
import { RegistryContext, useAtomSet, useAtomValue } from "@effect/atom-react";
import { useContext, useEffect, useRef } from "react";

import { manualFlightActive } from "../../../shared/studio.atoms.ts";
import { heldSticks, stickSource } from "../manual-flight.atoms.ts";
import {
  FLIGHT_KEYS,
  flightKey,
  padEdges,
  RESTING_STICKS,
  sticksFromKeys,
  sticksFromPad,
  withEdges,
} from "../stick-mapping.ts";
import type { PadState } from "../stick-mapping.ts";

const SEND_EVERY_MS = 15;

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLSelectElement ||
  target instanceof HTMLTextAreaElement;

const firstPad = (): PadState | undefined => {
  const pad = [...navigator.getGamepads()].find(
    (candidate) => candidate !== null && candidate.connected,
  );

  if (pad === undefined || pad === null) return undefined;

  return {
    layout: pad.mapping === "standard" ? "standard" : "rc",
    axes: [...pad.axes],
    buttons: pad.buttons.map((button) => button.pressed),
  };
};

const padName = () =>
  [...navigator.getGamepads()].find((candidate) => candidate !== null && candidate.connected)?.id ??
  "keyboard";

export const useManualFlight = () => {
  const registry = useContext(RegistryContext);
  const active = useAtomValue(manualFlightActive);
  const send = useAtomSet(sendSticks);
  const latestSend = useRef(send);

  useEffect(() => {
    latestSend.current = send;
  });

  useEffect(() => {
    if (!active) return;

    const keys = new Set<string>();
    let previousPad: PadState | undefined;
    let last = performance.now();

    registry.set(heldSticks, RESTING_STICKS);

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;

      const key = flightKey(event.key);

      if (FLIGHT_KEYS.has(key)) {
        keys.add(key);
        event.preventDefault();
      }

      if (event.repeat) return;

      if (event.key === "Enter") {
        registry.set(heldSticks, withEdges(registry.get(heldSticks), { arm: true, mode: false }));
        event.preventDefault();
      }

      if (key === "m")
        registry.set(heldSticks, withEdges(registry.get(heldSticks), { arm: false, mode: true }));
    };

    const onKeyUp = (event: KeyboardEvent) => keys.delete(flightKey(event.key));

    const onBlur = () => keys.clear();

    let frame = 0;

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);

      if (now - last < SEND_EVERY_MS) return;

      const dt = Math.min((now - last) / 1000, 0.1);
      const pad = firstPad();
      const held = registry.get(heldSticks);

      last = now;

      const next =
        pad === undefined
          ? sticksFromKeys(keys, held, dt)
          : withEdges(sticksFromPad(pad, held), padEdges(pad, previousPad));

      previousPad = pad;
      registry.set(heldSticks, next);
      registry.set(stickSource, padName());
      latestSend.current(next);
    };

    frame = requestAnimationFrame(tick);

    globalThis.addEventListener("keydown", onKeyDown);
    globalThis.addEventListener("keyup", onKeyUp);
    globalThis.addEventListener("blur", onBlur);

    return () => {
      cancelAnimationFrame(frame);
      globalThis.removeEventListener("keydown", onKeyDown);
      globalThis.removeEventListener("keyup", onKeyUp);
      globalThis.removeEventListener("blur", onBlur);
    };
  }, [active, registry]);
};
