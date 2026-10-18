"use client";

import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/cn";

export function DropdownMenu({
  trigger,
  label,
  children,
}: {
  trigger: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild aria-label={label}>
        {trigger}
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-52 rounded-xl border border-border bg-surface p-1.5 shadow-raised animate-pop-in"
        >
          {children}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

export function DropdownItem({
  className,
  ...props
}: React.ComponentProps<typeof Dropdown.Item>) {
  return (
    <Dropdown.Item
      className={cn(
        "flex h-9 cursor-pointer items-center rounded-md px-2.5 text-[13px] outline-none data-[highlighted]:bg-surface-hover",
        className,
      )}
      {...props}
    />
  );
}
