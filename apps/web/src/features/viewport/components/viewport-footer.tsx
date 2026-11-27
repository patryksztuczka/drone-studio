import type { ReactNode, RefObject } from "react";

interface ViewportFooterProps {
  readonly fps: RefObject<HTMLSpanElement | null>;
  readonly action: ReactNode;
}

export const ViewportFooter = ({ fps, action }: ViewportFooterProps) => (
  <div className="pointer-events-none absolute inset-x-5 bottom-5 z-10 flex items-center justify-between">
    <div className="pointer-events-auto flex items-center gap-2">
      {action}
      <span className="font-label text-[11px] leading-[14px] text-faint">
        thrust: blue &lt;55% · amber 55–80% · red &gt;80%
      </span>
    </div>
    <span ref={fps} className="font-label text-[11px] leading-[14px] text-faint uppercase" />
  </div>
);
