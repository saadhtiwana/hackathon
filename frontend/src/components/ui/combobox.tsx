"use client";

import { useState } from "react";
import { Command } from "cmdk";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { ChevronsUpDown } from "lucide-react";

export function Combobox({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        aria-label={label}
        className="inline-flex h-9 min-w-40 items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 text-[13px] hover:border-border-strong"
      >
        {current?.label ?? label}
        <ChevronsUpDown className="size-3.5 text-muted" aria-hidden />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          sideOffset={4}
          className="z-50 w-60 rounded-xl border border-border bg-surface p-1.5 shadow-raised animate-pop-in"
        >
          <Command label={label}>
            <Command.Input
              placeholder="Search"
              className="h-9 w-full bg-transparent px-2 text-[13px] outline-none"
            />
            <Command.List>
              <Command.Empty className="px-2.5 py-2 text-[13px] text-text-muted">No matches</Command.Empty>
              {options.map((option) => (
                <Command.Item
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className="flex h-9 cursor-pointer items-center rounded-md px-2.5 text-[13px] data-[selected=true]:bg-surface-hover"
                >
                  {option.label}
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
