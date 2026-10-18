"use client";

import { format } from "date-fns";
import { Money } from "@/components/ui/money";

export type SlotConversation = { id: string; channel: string };
export type SlotPayment = { id: string; status: string; amountCents?: number; currency?: string; createdAt: string };
export type SlotAppointment = { id: string; title: string; startsAt: string; status: string };

export function ContactConversations({ items }: { items: SlotConversation[] }) {
  if (items.length === 0) return <p className="text-[14px] text-text-muted">No conversations yet.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id} className="rounded-lg border border-border px-3 py-2 text-[14px]">
          {item.channel}
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
