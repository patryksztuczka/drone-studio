import { cn } from "@drone-studio/ui/lib/utils";
import type { ReactNode } from "react";

export interface SegmentOption<T extends string> {
  readonly value: T;
  readonly label: ReactNode;
  readonly title?: string;
}

interface SegmentedProps<T extends string> {
  readonly label: string;
  readonly value: T;
  readonly options: ReadonlyArray<SegmentOption<T>>;
  readonly onChange: (value: T) => void;
  readonly accent?: string;
  readonly className?: string;
}

export const Segmented = <T extends string>({
  label,
  value,
  options,
  onChange,
  accent = "var(--sim)",
  className,
}: SegmentedProps<T>) => (
  <div
    role="radiogroup"
    aria-label={label}
    className={cn(
      "flex items-center gap-0.5 rounded-md border border-hairline bg-panel p-0.5",
      className,
    )}
  >
    {options.map((option) => {
      const selected = option.value === value;

      return (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={selected}
          title={option.title}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex h-6 items-center gap-1.5 rounded-[5px] px-2 font-mono text-[11px] tracking-wide transition-colors",
            selected
              ? "bg-panel-raised text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          style={selected ? { boxShadow: `inset 0 -1.5px 0 ${accent}`, color: accent } : undefined}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);
