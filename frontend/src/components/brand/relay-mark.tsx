import { cn } from "@/lib/cn";

export function RelayMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <span aria-hidden className={cn("relative inline-block shrink-0", className)} style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- local brand mark, swapped for dark theme */}
      <img src="/brand/relay-mark.png" alt="" width={size} height={size} className="absolute inset-0 size-full object-contain [.dark_&]:hidden" draggable={false} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/relay-mark-dark.png" alt="" width={size} height={size} className="absolute inset-0 hidden size-full object-contain [.dark_&]:block" draggable={false} />
    </span>
  );
}
