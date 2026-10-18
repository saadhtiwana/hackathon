"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export function Select({
  value,
  onValueChange,
  placeholder,
  options,
  label,
  disabled,
}: {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  options: { value: string; label: string }[];
  label: string;
  disabled?: boolean;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        aria-label={label}
        className="inline-flex h-9 min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 text-[13px] text-text hover:border-border-strong focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-accent/20 focus-visible:outline-none disabled:opacity-60 data-[placeholder]:text-text-muted"
      >
        <SelectPrimitive.Value placeholder={placeholder ?? label} />
        <SelectPrimitive.Icon>
          <ChevronDown className="size-3.5 text-muted" aria-hidden />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-y-auto rounded-xl border border-border bg-surface p-1.5 shadow-raised animate-pop-in"
        >
          <SelectPrimitive.Viewport>
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className="flex h-9 cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 text-[13px] outline-none data-[highlighted]:bg-surface-hover data-[state=checked]:font-medium"
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator>
                  <Check className="size-3.5 text-accent-text" aria-hidden />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export function NativeSelect({
  className,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-9 rounded-md border border-border bg-surface px-2.5 text-[13px] text-text hover:border-border-strong focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-accent/20 focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  );
}
