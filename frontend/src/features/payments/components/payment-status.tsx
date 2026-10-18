import { CircleCheck, CircleDashed, CircleOff, Clock, RotateCcw, Undo2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { PaymentStatus } from "../api";

const statuses: Record<PaymentStatus, { label: string; icon: typeof Clock; className: string }> = {
  requested: { label: "Requested", icon: CircleDashed, className: "bg-accent-soft text-accent-text" },
  paid: { label: "Paid", icon: CircleCheck, className: "bg-tint-green text-tint-green-text" },
  expired: { label: "Expired", icon: Clock, className: "bg-surface-muted text-text-muted" },
  failed: { label: "Failed", icon: CircleOff, className: "bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-danger" },
  refunded: { label: "Refunded", icon: Undo2, className: "bg-tint-pink text-tint-pink-text" },
  partially_refunded: { label: "Partly refunded", icon: RotateCcw, className: "bg-tint-yellow text-tint-yellow-text" },
};

export function PaymentStatusPill({ status }: { status: PaymentStatus }) {
  const s = statuses[status] ?? statuses.requested;
  const Icon = s.icon;
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium whitespace-nowrap", s.className)}>
      <Icon className="size-3.5" aria-hidden />
      {s.label}
    </span>
  );
}
