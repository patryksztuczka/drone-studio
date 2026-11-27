import type { CSSProperties } from "react";

interface DraftingGridProps {
  readonly top: number;
  readonly bottom: number;
  readonly side: number;
}

const px = (value: number) => `${String(value)}px`;

const Mark = ({ style }: { readonly style: CSSProperties }) => (
  <span
    className="absolute size-[7px] -translate-1/2 rounded-full border border-registration bg-background"
    style={style}
  />
);

export const DraftingGrid = ({ top, bottom, side }: DraftingGridProps) => {
  const middle = `calc(${px(top)} + (100% - ${px(top + bottom)}) / 2)`;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <span className="absolute inset-x-0 h-px bg-line" style={{ top: px(top) }} />
      <span className="absolute inset-x-0 h-px bg-line" style={{ bottom: px(bottom) }} />
      <span className="absolute inset-y-0 w-px bg-line" style={{ left: px(side) }} />
      <span className="absolute inset-y-0 w-px bg-line" style={{ right: px(side) }} />
      <span
        className="absolute h-px bg-line-soft"
        style={{ top: middle, left: px(side), right: px(side) }}
      />
      <span
        className="absolute w-px bg-line-soft"
        style={{ left: "25%", top: px(top), bottom: px(bottom) }}
      />
      <span
        className="absolute w-px bg-line-soft"
        style={{ left: "75%", top: px(top), bottom: px(bottom) }}
      />
      <span
        className="absolute h-px w-2 -translate-x-1/2 bg-[#d8d8d8]"
        style={{ left: "50%", top: middle }}
      />
      <span
        className="absolute h-2 w-px -translate-y-1/2 bg-[#d8d8d8]"
        style={{ left: "50%", top: middle }}
      />
      <Mark style={{ left: px(side), top: px(top) }} />
      <Mark style={{ right: px(side - 7), top: px(top) }} />
      <Mark style={{ left: px(side), bottom: px(bottom - 7) }} />
      <Mark style={{ right: px(side - 7), bottom: px(bottom - 7) }} />
    </div>
  );
};
