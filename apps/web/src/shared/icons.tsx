import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export const StudioMark = (props: IconProps) => (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true" {...props}>
    <path d="M11 1.5L19.2 6.25V15.75L11 20.5L2.8 15.75V6.25Z" stroke="#111111" strokeWidth="1.3" />
    <path d="M7 8L15 14M15 8L7 14" stroke="#0a6cff" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export const ChevronIcon = (props: IconProps) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" {...props}>
    <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

export const PlayIcon = (props: IconProps) => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" {...props}>
    <path d="M2 1L9 5L2 9Z" fill="currentColor" />
  </svg>
);

export const PauseIcon = (props: IconProps) => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" {...props}>
    <rect x="1" y="1" width="2.6" height="8" fill="currentColor" />
    <rect x="6.4" y="1" width="2.6" height="8" fill="currentColor" />
  </svg>
);

const Glyph = ({ children, ...props }: IconProps) => (
  <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true" {...props}>
    {children}
  </svg>
);

export const WorkbenchIcon = (props: IconProps) => (
  <Glyph stroke="currentColor" {...props}>
    <circle cx="4" cy="4" r="2.6" />
    <circle cx="14" cy="4" r="2.6" />
    <circle cx="4" cy="14" r="2.6" />
    <circle cx="14" cy="14" r="2.6" />
    <path d="M6 6L12 12M12 6L6 12" />
  </Glyph>
);

export const HardwareIcon = (props: IconProps) => (
  <Glyph stroke="currentColor" {...props}>
    <rect x="3" y="3" width="12" height="12" />
    <rect x="6.5" y="6.5" width="5" height="5" />
  </Glyph>
);

export const RunsIcon = (props: IconProps) => (
  <Glyph stroke="currentColor" {...props}>
    <path d="M2 4H16M2 9H16M2 14H16" />
  </Glyph>
);

export const EmulationIcon = (props: IconProps) => (
  <Glyph stroke="currentColor" {...props}>
    <rect x="2" y="4" width="14" height="10" rx="1" />
    <path d="M5 8L7 10L5 12M9 12H12" />
  </Glyph>
);

export const ShowcaseIcon = (props: IconProps) => (
  <Glyph stroke="currentColor" {...props}>
    <path d="M2 6V2H6M12 2H16V6M16 12V16H12M6 16H2V12" />
  </Glyph>
);

export const AgentIcon = (props: IconProps) => (
  <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true" {...props}>
    <path d="M7 1.5L8.3 5.7L12.5 7L8.3 8.3L7 12.5L5.7 8.3L1.5 7L5.7 5.7Z" fill="currentColor" />
  </svg>
);
