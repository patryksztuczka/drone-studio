import { useFrame, useThree } from "@react-three/fiber";
import { useMemo } from "react";
import { Vector3 } from "three";
import type { Object3D } from "three";

import { writeText } from "../../../shared/dom.ts";
import type { Triple } from "../frames-of-reference.ts";

export interface TagSlot {
  readonly root: HTMLElement;
  readonly value?: Element | null;
}

export type TagSlots = Map<string, TagSlot>;

export interface Anchor {
  readonly id: string;
  readonly object: () => Object3D | null;
  readonly local: Triple;
  readonly value?: () => string;
  readonly valueClass?: () => string;
}

interface AnchorTrackerProps {
  readonly anchors: ReadonlyArray<Anchor>;
  readonly slots: TagSlots;
}

export const AnchorTracker = ({ anchors, slots }: AnchorTrackerProps) => {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const point = useMemo(() => new Vector3(), []);

  useFrame(() => {
    for (const anchor of anchors) {
      const slot = slots.get(anchor.id);

      if (slot === undefined) continue;

      const object = anchor.object();

      if (object === null || !object.visible) {
        slot.root.style.opacity = "0";
        continue;
      }

      point.set(...anchor.local);
      object.localToWorld(point);
      point.project(camera);

      const x = ((point.x + 1) / 2) * size.width;
      const y = ((1 - point.y) / 2) * size.height;
      const inside = Math.abs(point.x) <= 1.05 && Math.abs(point.y) <= 1.05;

      slot.root.style.opacity = inside ? "1" : "0";
      slot.root.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;

      const target = slot.value;

      if (target instanceof HTMLElement) {
        if (anchor.value !== undefined) writeText(target, anchor.value());

        if (anchor.valueClass !== undefined) target.className = anchor.valueClass();
      }
    }
  });

  return null;
};
