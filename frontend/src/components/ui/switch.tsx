"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/cn";

export function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "relative h-5 w-9 rounded-full border border-line bg-paper data-[state=checked]:border-ok data-[state=checked]:bg-ok",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-3.5 translate-x-0.5 rounded-full bg-ink transition-transform data-[state=checked]:translate-x-4 data-[state=checked]:bg-surface" />
    </SwitchPrimitive.Root>
  );
}
