import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export type Tint = "green" | "blue" | "yellow" | "pink" | "violet";

const tints: Record<Tint, string> = {
  green: "bg-tint-green text-tint-green-text",
  blue: "bg-tint-blue text-tint-blue-text",
  yellow: "bg-tint-yellow text-tint-yellow-text",
  pink: "bg-tint-pink text-tint-pink-text",
  violet: "bg-tint-violet text-tint-violet-text",
};

export function StatTile({
  label,
  value,
  icon: Icon,
  tint = "violet",
  hint,
  href,
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  tint?: Tint;
  hint?: string;
  href?: string;
}) {
  const body = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 text-[22px] leading-none font-semibold tracking-tight tabular-nums sm:text-[32px]">{value}</span>
        <span className="hidden size-9 items-center justify-center rounded-lg bg-surface/70 sm:inline-flex" aria-hidden>
          <Icon className="size-[18px]" />
        </span>
      </span>
      <span className="mt-3 block text-[13px] font-medium">{label}</span>
      {hint ? <span className="mt-0.5 block text-[12px] opacity-80">{hint}</span> : null}
    </>
  );
  const cls = cn("block rounded-xl p-4", tints[tint]);
  return href ? (
    <Link href={href} className={cn(cls, "hover:-translate-y-0.5 hover:shadow-raised")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
