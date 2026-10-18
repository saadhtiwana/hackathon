"use client";

import { formatMoney } from "@/lib/format";
import { Tooltip } from "@/components/ui/tooltip";

export function Money({
  cents,
  currency = "PKR",
  hidden = false,
}: {
  cents?: number | null;
  currency?: string;
  hidden?: boolean;
}) {
  if (hidden || cents == null) {
    return (
      <Tooltip content="Requires View values permission">
        <span className="font-mono text-[13px] text-muted tabular-nums">•••• hidden</span>
      </Tooltip>
    );
  }
  return <span className="font-mono text-[13px] tabular-nums">{formatMoney(cents, currency)}</span>;
}
