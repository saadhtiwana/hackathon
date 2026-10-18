"use client";

import Link from "next/link";
import { Mail } from "lucide-react";
import { format } from "date-fns";
import { Money } from "@/components/ui/money";

export type SlotConversation = { id: string; channel: string; subject?: string | null; lastMessageAt?: string | null; lastMessage?: { body: string; direction: string; status: string } | null };
export type SlotPayment = { id: string; status: string; amountCents?: number; currency?: string; createdAt: string };
export type SlotAppointment = { id: string; title: string; startsAt: string; status: string };

export function ContactConversations({ items }: { items: SlotConversation[] }) {
  if (items.length === 0) return <p className="text-[14px] text-text-muted">No conversations yet.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id}>
          <Link href={`/inbox?c=${item.id}`} className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5 text-[14px] hover:bg-surface-muted">
            <Mail className="mt-0.5 size-4 shrink-0 text-text-muted" aria-label={item.channel} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{item.subject ?? (item.channel === "email" ? "Email conversation" : item.channel)}</span>
              <span className="block truncate text-[13px] text-text-muted">
                {item.lastMessage ? `${item.lastMessage.direction === "out" ? "You: " : ""}${item.lastMessage.body}` : "No messages"}
              </span>
            </span>
            {item.lastMessageAt ? <span className="shrink-0 text-[12px] text-text-muted tabular-nums">{format(new Date(item.lastMessageAt), "d MMM, HH:mm")}</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ContactPayments({ items, hidden }: { items: SlotPayment[]; hidden: boolean }) {
  if (items.length === 0) return <p className="text-[14px] text-text-muted">No payments yet.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-[14px]">
          <span>{item.status}</span>
          <Money cents={item.amountCents} currency={item.currency} hidden={hidden} />
        </li>
      ))}
    </ul>
  );
}

export function ContactAppointments({ items }: { items: SlotAppointment[] }) {
  if (items.length === 0) return <p className="text-[14px] text-text-muted">No appointments yet.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id} className="rounded-lg border border-border px-3 py-2 text-[14px]">
          {item.title}
          <span className="block text-[12px] text-text-muted">{format(new Date(item.startsAt), "d MMM yyyy, HH:mm")} · {item.status}</span>
        </li>
      ))}
    </ul>
  );
}
