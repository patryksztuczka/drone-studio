import { cn } from "@drone-studio/ui/lib/utils";
import type { ReactNode } from "react";

export interface SegmentOption<T extends string> {
  readonly value: T;
  readonly label: ReactNode;
  readonly title?: string;
  readonly selectedClassName?: string;
}

interface SegmentedProps<T extends string> {
  readonly label: string;
  readonly value: T;
  readonly options: ReadonlyArray<SegmentOption<T>>;
  readonly onChange: (value: T) => void;
  readonly hint?: string;
  readonly mono?: boolean;
  readonly className?: string;
}

export const Segmented = <T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
  mono = false,
  className,
}: SegmentedProps<T>) => (
  <div
    role="radiogroup"
    aria-label={label}
    className={cn(
      "flex items-center gap-0.5 rounded-full border border-line-strong bg-surface p-[3px]",
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
            "cursor-pointer rounded-full py-1 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue/30",
            mono ? "px-2 font-label text-[11px] leading-[14px]" : "px-2.5 text-[12px] leading-4",
            selected
              ? (option.selectedClassName ?? "bg-ink text-white")
              : "text-muted hover:text-ink",
            selected && mono ? "px-2.5" : undefined,
          )}
        >
          {option.label}
        </button>
      );
    })}
    {hint === undefined ? null : (
      <kbd className="pr-1.5 pl-0.5 font-label text-[10px] leading-3 text-faint">{hint}</kbd>
    )}
  </div>
);
