"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Mail } from "lucide-react";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api/client";

type Enquiry = { subject: string | null; body: string | null; receivedAt: string; channel: string; conversationId: string | null; contact: { id: string; name: string; email: string | null } | null };

// The message that started the lead, so nobody has to dig for it.
export function EnquiryCard({ leadId }: { leadId: string }) {
  const q = useQuery({ queryKey: ["leads", "enquiry", leadId], queryFn: () => apiFetch<Enquiry>(`/leads/${leadId}/enquiry`), retry: false });
  const e = q.data;
  if (!e || !e.body) return null;
  return (
    <Card className="mb-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-text-muted">
        <span className="inline-flex items-center gap-1.5"><Mail className="size-3.5" aria-hidden /> {e.channel === "email" ? "Email" : e.channel} enquiry</span>
        <span className="tabular-nums">Received {format(new Date(e.receivedAt), "d MMM, HH:mm")}</span>
      </div>
      {e.subject ? <h2 className="mt-2 text-[16px] font-semibold">{e.subject}</h2> : null}
      <p className="mt-1 text-[14px] whitespace-pre-wrap">{e.body}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
        {e.contact ? (
          <Link className="font-medium underline" href={`/contacts/${e.contact.id}`}>
            {e.contact.name}{e.contact.email ? ` · ${e.contact.email}` : ""}
          </Link>
        ) : null}
        {e.conversationId ? <Link className="font-medium underline" href={`/inbox?c=${e.conversationId}`}>Open conversation</Link> : null}
      </div>
    </Card>
  );
}
