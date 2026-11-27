import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "../lib/utils.ts";

export const pillVariants = cva(
  "inline-flex shrink-0 items-center gap-1.5 rounded-full border font-label leading-[14px] whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
  {
    variants: {
      tone: {
        neutral: "border-line-strong bg-surface text-ink",
        quiet: "border-line bg-surface text-muted hover:text-ink",
        blue: "border-blue bg-surface text-blue",
        sim: "border-blue bg-blue-soft text-blue",
        emu: "border-amber bg-amber-soft text-amber",
        real: "border-ok bg-surface text-ok",
        fail: "border-fail bg-surface text-fail",
        solid: "border-blue bg-blue text-white",
      },
      size: {
        xs: "px-[7px] py-0.5 text-[11px]",
        sm: "px-2.5 py-1 text-[11px]",
        md: "px-2.5 py-1 text-[12px] leading-4",
      },
    },
    defaultVariants: { tone: "neutral", size: "sm" },
  },
);

type PillProps = ComponentProps<"span"> & VariantProps<typeof pillVariants>;

export const Pill = ({ className, tone, size, ...props }: PillProps) => (
  <span className={cn(pillVariants({ tone, size }), className)} {...props} />
);

type PillButtonProps = ComponentProps<"button"> & VariantProps<typeof pillVariants>;

export const PillButton = ({ className, tone, size, type, ...props }: PillButtonProps) => (
  <button
    type={type === "submit" || type === "reset" ? type : "button"}
    className={cn(pillVariants({ tone, size }), "cursor-pointer", className)}
    {...props}
  />
);

const dotVariants = cva("inline-block size-1.5 shrink-0 rounded-[3px]", {
  variants: {
    tone: {
      blue: "bg-blue",
      ok: "bg-ok",
      fail: "bg-fail",
      amber: "bg-amber",
      faint: "bg-line-strong",
      ink: "bg-ink",
    },
  },
  defaultVariants: { tone: "blue" },
});

type DotProps = ComponentProps<"span"> & VariantProps<typeof dotVariants>;

export const Dot = ({ className, tone, ...props }: DotProps) => (
  <span aria-hidden="true" className={cn(dotVariants({ tone }), className)} {...props} />
);
