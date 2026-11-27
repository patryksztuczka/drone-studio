import { DropdownMenu } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "../lib/utils.ts";

export const Menu = DropdownMenu.Root;

export const MenuTrigger = DropdownMenu.Trigger;

export const MenuContent = ({
  className,
  sideOffset = 10,
  align = "start",
  ...props
}: ComponentProps<typeof DropdownMenu.Content>) => (
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      sideOffset={sideOffset}
      align={align}
      className={cn(
        "z-50 flex flex-col border border-line-strong bg-surface text-[12px] leading-4 text-ink shadow-menu outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  </DropdownMenu.Portal>
);

export const MenuLabel = ({ className, ...props }: ComponentProps<typeof DropdownMenu.Label>) => (
  <DropdownMenu.Label
    className={cn(
      "border-b border-line px-3.5 py-2.5 font-label text-[11px] leading-[14px] tracking-[0.04em] text-faint uppercase",
      className,
    )}
    {...props}
  />
);

export const MenuItem = ({ className, ...props }: ComponentProps<typeof DropdownMenu.Item>) => (
  <DropdownMenu.Item
    className={cn(
      "flex cursor-pointer items-center gap-3 px-3.5 py-3 outline-none select-none data-[disabled]:cursor-default data-[disabled]:opacity-50 data-[highlighted]:bg-background",
      className,
    )}
    {...props}
  />
);

export const MenuSeparator = ({
  className,
  ...props
}: ComponentProps<typeof DropdownMenu.Separator>) => (
  <DropdownMenu.Separator className={cn("h-px bg-line", className)} {...props} />
);
