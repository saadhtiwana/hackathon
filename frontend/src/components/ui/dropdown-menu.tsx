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
          className="z-50 min-w-48 rounded-lg border border-line bg-surface p-1 shadow-float"
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
        "flex h-9 cursor-pointer items-center rounded-sm px-2 text-[13px] outline-none data-[highlighted]:bg-wash",
        className,
      )}
      {...props}
    />
  );
}
