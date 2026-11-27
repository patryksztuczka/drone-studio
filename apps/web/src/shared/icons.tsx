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

export const ResetIcon = (props: IconProps) => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true" {...props}>
    <path
      d="M2.5 7a4.5 4.5 0 1 0 1.4-3.3M2.5 2v2.5H5"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
  </svg>
);

export const ShowcaseIcon = (props: IconProps) => (
  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true" {...props}>
    <path
      d="M1.5 5V1.5H5M9 1.5h3.5V5M12.5 9v3.5H9M5 12.5H1.5V9"
      stroke="currentColor"
      strokeWidth="1.2"
    />
  </svg>
);

export const GamepadIcon = (props: IconProps) => (
  <svg width="14" height="10" viewBox="0 0 20 14" fill="none" aria-hidden="true" {...props}>
    <rect x="1" y="1" width="18" height="12" rx="6" stroke="currentColor" strokeWidth="1.3" />
    <path d="M5 7H9M7 5V9" stroke="currentColor" strokeWidth="1.3" />
    <circle cx="14" cy="6" r="1" fill="currentColor" />
  </svg>
);

export const GhostIcon = (props: IconProps) => (
  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true" {...props}>
    <path
      d="M3 12.5V6a4 4 0 0 1 8 0v6.5l-1.3-1-1.4 1-1.3-1-1.3 1-1.4-1z"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  </svg>
);
