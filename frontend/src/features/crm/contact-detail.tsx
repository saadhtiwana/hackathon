"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useMe } from "@/components/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api/client";
import { can } from "@/lib/permissions";
import { useCrmMutations, type Activity } from "./api";
import { ActivityTimeline } from "./activity-timeline";
import { Problem } from "./problem";
import { ContactActions } from "./contact-actions";
import { ContactAppointments, ContactConversations, ContactPayments, type SlotAppointment, type SlotConversation, type SlotPayment } from "./slots";

type Detail = {
  contact: { id: string; name: string; phone: string | null; email: string | null; optedOut: boolean };
  company: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
  opportunities: { id: string; name: string; stageName: string; valueCents?: number; currency?: string }[];
  conversations: SlotConversation[];
  payments: SlotPayment[];
  appointments: SlotAppointment[];
  activities: Activity[];
};

export function ContactDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const me = useMe();
  const toast = useToast();
  const [note, setNote] = useState("");
  const { addNote } = useCrmMutations();
  const query = useQuery({
    queryKey: ["contacts", "detail", id],
    queryFn: () => apiFetch<Detail>(`/contacts/${id}`),
  });
  const hidden = !can(me.data, "crm.view_values");
  if (query.isLoading) return <Skeleton className="h-48 w-full" />;
  if (query.isError) return <Problem error={query.error} onRetry={() => void query.refetch()} />;
  const data = query.data;
  if (!data) return null;
  return (
    <div className="max-w-3xl">
      <Link href="/contacts" className="text-[13px] text-text-muted hover:underline">Contacts</Link>
      <h1 className="mt-2 text-[28px] leading-tight font-semibold tracking-tight sm:text-[32px]">{data.contact.name}</h1>
      <p className="mt-2 text-[15px] text-text-muted">
        {[data.contact.phone, data.contact.email, data.company ? data.company.name : null, data.owner ? data.owner.name : "Unassigned"].filter(Boolean).join(" · ")}
      </p>
      {data.contact.optedOut ? <Badge tone="signal" className="mt-2">Opted out</Badge> : null}
      {can(me.data, "crm.edit") ? <ContactActions contactId={data.contact.id} contactName={data.contact.name} conversationId={data.conversations[0]?.id ?? null} ownerId={data.owner?.id ?? null} /> : null}

      <section className="mt-8">
        <h2 className="text-[18px] font-semibold">Conversations</h2>
        <div className="mt-2"><ContactConversations items={data.conversations} /></div>
      </section>
      <section className="mt-8">
        <h2 className="text-[18px] font-semibold">Opportunities</h2>
        <ul className="mt-2 flex flex-col gap-2">
          {data.opportunities.map((opp) => (
            <li key={opp.id}>
              <Link href={`/opportunities/${opp.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-[14px] hover:bg-surface-muted">
                <span>{opp.name}<span className="text-text-muted"> · {opp.stageName}</span></span>
                <Money cents={opp.valueCents} currency={opp.currency} hidden={hidden || opp.valueCents == null} />
              </Link>
            </li>
          ))}
          {data.opportunities.length === 0 ? <li className="text-[14px] text-text-muted">None yet.</li> : null}
        </ul>
      </section>
      <section className="mt-8">
        <h2 className="text-[18px] font-semibold">Payments</h2>
        <div className="mt-2"><ContactPayments items={data.payments} hidden={hidden} /></div>
      </section>
      <section className="mt-8">
        <h2 className="text-[18px] font-semibold">Appointments</h2>
        <div className="mt-2"><ContactAppointments items={data.appointments} /></div>
      </section>
      <section className="mt-8">
        <h2 className="text-[18px] font-semibold">Activity</h2>
        <div className="mt-3"><ActivityTimeline items={data.activities} /></div>
        {can(me.data, "crm.edit") ? (
          <form
            className="mt-4 flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!note.trim()) return;
              addNote.mutate(
                { contactId: id, body: note.trim() },
                {
                  onSuccess: () => {
                    setNote("");
                    toast("Note added", "ok");
                  },
                },
              );
            }}
          >
            <label htmlFor="contact-note" className="text-[13px] font-medium">Add note</label>
            <Textarea id="contact-note" value={note} onChange={(event) => setNote(event.target.value)} />
            {addNote.isError ? <Problem error={addNote.error} /> : null}
            <Button type="submit" className="self-start" disabled={addNote.isPending}>{addNote.isPending ? "Saving" : "Add note"}</Button>
          </form>
        ) : null}
      </section>
    </div>
  );
}
