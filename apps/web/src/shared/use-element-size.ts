import { useEffect, useRef, useState } from "react";

import { observeSize } from "./dom.ts";

export interface ElementSize {
  readonly width: number;
  readonly height: number;
}

export const useElementSize = <T extends HTMLElement>() => {
  const element = useRef<T>(null);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  useEffect(() => {
    const target = element.current;

    if (target === null) return;

    setSize({ width: target.clientWidth, height: target.clientHeight });

    return observeSize(target, (width, height) => setSize({ width, height }));
  }, []);

  return { element, size };
};
