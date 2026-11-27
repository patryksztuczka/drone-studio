import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const Base = ({ children, ...props }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    {children}
  </svg>
);

export const PlayIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M7 5.5v13l11-6.5z" fill="currentColor" stroke="none" />
  </Base>
);

export const PauseIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M8 5.5v13M16 5.5v13" strokeWidth="3" />
  </Base>
);

export const ResetIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
    <path d="M4.5 4.5v4h4" />
  </Base>
);

export const GamepadIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M7 8h10a4 4 0 0 1 3.9 4.9l-.8 3.4a2.2 2.2 0 0 1-3.8 1L14.6 15H9.4l-1.7 2.3a2.2 2.2 0 0 1-3.8-1l-.8-3.4A4 4 0 0 1 7 8z" />
    <path d="M8 10.5v3M6.5 12h3M15.5 11.2h.01M17.5 12.8h.01" />
  </Base>
);

export const XrayIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" strokeDasharray="2 2" />
  </Base>
);

export const ShowcaseIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />
    <circle cx="12" cy="12" r="2.5" />
  </Base>
);

export const OrbitIcon = (props: IconProps) => (
  <Base {...props}>
    <ellipse cx="12" cy="12" rx="9" ry="4" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
  </Base>
);

export const FollowIcon = (props: IconProps) => (
  <Base {...props}>
    <circle cx="12" cy="12" r="7.5" />
    <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" />
  </Base>
);

export const GhostIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M6 20V10a6 6 0 0 1 12 0v10l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5z" />
    <path d="M10 10.5h.01M14 10.5h.01" />
  </Base>
);

export const CloseIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Base>
);

export const DroneMark = (props: IconProps) => (
  <svg viewBox="0 0 32 32" width="22" height="22" fill="none" aria-hidden="true" {...props}>
    <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="24" cy="8" r="5" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="8" cy="24" r="5" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="24" cy="24" r="5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M11.5 11.5l9 9M20.5 11.5l-9 9" stroke="currentColor" strokeWidth="1.6" />
    <rect x="13" y="13" width="6" height="6" rx="1.2" fill="currentColor" />
  </svg>
);
