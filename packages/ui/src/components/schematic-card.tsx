import type { ComponentProps, ReactNode } from "react";

import { cn } from "../lib/utils.ts";

export const SchematicCard = ({ className, ...props }: ComponentProps<"section">) => (
  <section
    data-slot="schematic-card"
    className={cn(
      "flex flex-col border border-line-strong bg-surface font-label text-[12px] leading-4 text-ink shadow-card",
      className,
    )}
    {...props}
  />
);

interface CardHeaderProps {
  readonly title: ReactNode;
  readonly aside?: ReactNode;
  readonly className?: string;
}

export const CardHeader = ({ title, aside, className }: CardHeaderProps) => (
  <header
    className={cn(
      "flex items-center justify-between gap-3 border-b border-line px-3.5 py-3",
      className,
    )}
  >
    <h2 className="min-w-0 truncate text-[12px] leading-4 font-normal tracking-[0.04em] text-ink-soft uppercase">
      {title}
    </h2>
    {aside === undefined ? null : (
      <div className="flex shrink-0 items-center gap-1.5 text-faint">{aside}</div>
    )}
  </header>
);

export const CardBody = ({ className, ...props }: ComponentProps<"div">) => (
  <div className={cn("flex flex-col gap-[9px] px-3.5 py-3", className)} {...props} />
);

export const CardFooter = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    className={cn(
      "flex items-baseline justify-between gap-3 border-t border-line px-3.5 py-3",
      className,
    )}
    {...props}
  />
);

interface CardRowProps {
  readonly label: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}

export const CardRow = ({ label, children, className }: CardRowProps) => (
  <div className={cn("flex items-center justify-between gap-3", className)}>
    <span className="shrink-0">{label}</span>
    <span className="min-w-0 truncate text-right tabular-nums">{children}</span>
  </div>
);
