"use client";

import { Avatar } from "@/components/ui/avatar";
import { useMemberLookup } from "../api";

// Owner or assignee: avatar with presence dot, then the name (or "You").
export function Owner({ id, me, size = "sm" }: { id: string | null | undefined; me?: string; size?: "xs" | "sm" | "md" }) {
  const lookup = useMemberLookup();
  if (!id) return <span className="text-text-muted">Nobody</span>;
  const m = lookup(id);
  const name = m?.name ?? "Former member";
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Avatar name={name} id={id} size={size} status={m?.status} />
      <span className="truncate">{id === me ? "You" : name}</span>
    </span>
  );
}
