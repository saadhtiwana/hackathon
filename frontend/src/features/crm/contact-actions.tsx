"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Check, Copy, Mail, MessageSquare, Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api/client";
import { BookingDialog } from "@/features/appointments/booking-dialog";

type Pipeline = { id: string; name: string; isDefault: boolean };
type Created = { payment: { id: string; url: string | null; status: string; amountCents: number; currency: string }; emailed: boolean; emailNote: string | null; emailedTo: string | null; opportunityCreated: boolean };

const tone = { requested: "warn", paid: "ok", expired: "away", failed: "signal", refunded: "neutral", partially_refunded: "neutral" } as const;
const word = (s: string) => s.replace("_", " ").replace(/^./, (c) => c.toUpperCase());

// Always-visible actions on a contact or lead page; each completes inline and refreshes the page data.
export function ContactActions({ contactId, contactName, conversationId, ownerId, defaultName }: { contactId: string; contactName: string; conversationId?: string | null; ownerId?: string | null; defaultName?: string }) {
  return (
    <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Actions">
      {conversationId ? (
        <Button asChild variant="quiet">
          <Link href={`/inbox?c=${conversationId}`}>
            <MessageSquare className="size-4" aria-hidden /> Reply
          </Link>
        </Button>
      ) : (
        <Button variant="quiet" disabled title="No conversation yet; email arrives in the Inbox">
          <MessageSquare className="size-4" aria-hidden /> Reply
        </Button>
      )}
      <NewOpportunity contactId={contactId} defaultName={defaultName ?? `${contactName} — enquiry`} ownerId={ownerId} />
      <BookingDialog contactId={contactId} contactName={contactName} trigger={<Button variant="quiet"><CalendarPlus className="size-4" aria-hidden /> Book appointment</Button>} />
      <RequestPayment contactId={contactId} />
    </div>
  );
}

function useRefresh() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries();
}

function NewOpportunity({ contactId, defaultName, ownerId }: { contactId: string; defaultName: string; ownerId?: string | null }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [pipelineId, setPipelineId] = useState<string>("");
  const toast = useToast();
  const refresh = useRefresh();
  const pipelines = useQuery({ queryKey: ["pipelines", "list"], enabled: open, queryFn: () => apiFetch<{ items: Pipeline[] }>("/pipelines") });
  const items = pipelines.data?.items ?? [];
  const chosen = pipelineId || items.find((p) => p.isDefault)?.id || items[0]?.id || "";
  const create = useMutation({
    mutationFn: () => apiFetch("/opportunities", { method: "POST", body: { pipelineId: chosen, contactId, name: name.trim(), ...(ownerId ? { ownerId } : {}) } }),
    onSuccess: () => {
      toast("Opportunity created", "ok");
      setOpen(false);
      refresh();
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen} title="New opportunity" description="Starts in the first stage of the pipeline." trigger={<Button variant="quiet"><Plus className="size-4" aria-hidden /> New opportunity</Button>}>
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (name.trim() && chosen) create.mutate(); }}>
        <Field label="Name" htmlFor="opp-name"><Input id="opp-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={160} /></Field>
        <Field label="Pipeline" htmlFor="opp-pipe">
          <Select label="Pipeline" value={chosen} onValueChange={setPipelineId} options={items.map((p) => ({ value: p.id, label: p.name }))} />
        </Field>
        <Notice error={create.error} />
        <Button type="submit" disabled={create.isPending || !chosen}>{create.isPending ? "Creating" : "Create opportunity"}</Button>
      </form>
    </Dialog>
  );
}

function RequestPayment({ contactId }: { contactId: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("25000");
  const [currency, setCurrency] = useState("PKR");
  const [result, setResult] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const refresh = useRefresh();
  const create = useMutation({
    mutationFn: () => apiFetch<Created>(`/contacts/${contactId}/request-payment`, { method: "POST", body: { amount: Number(amount), currency } }),
    onSuccess: (r) => {
      setResult(r);
      toast(r.emailed ? `Payment link emailed to ${r.emailedTo}` : "Payment link created", "ok");
      refresh();
    },
  });
  const live = useQuery({
    queryKey: ["payments", "one", result?.payment.id],
    enabled: !!result,
    queryFn: () => apiFetch<{ payment: { status: string } }>(`/payments/${result!.payment.id}`),
    refetchInterval: 4000,
  });
  const status = live.data?.payment.status ?? result?.payment.status ?? "requested";
  const bad = !(Number(amount) > 0);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setResult(null);
      }}
      title="Request payment"
      description="Creates a secure Stripe checkout link and emails it to the contact."
      trigger={<Button variant="quiet"><Wallet className="size-4" aria-hidden /> Request payment</Button>}
    >
      {result ? (
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-[14px]">
            <StatusPill tone={tone[status as keyof typeof tone] ?? "neutral"}>{word(status)}</StatusPill>
            <span className="font-mono tabular-nums">{Number(amount).toLocaleString()} {currency}</span>
          </p>
          <p className="flex items-center gap-2 text-[13px] text-text-muted"><Mail className="size-4" aria-hidden />{result.emailed ? `Emailed to ${result.emailedTo}` : (result.emailNote ?? "Not emailed")}</p>
          {result.payment.url ? (
            <div className="flex gap-2">
              <Input readOnly aria-label="Payment link" value={result.payment.url} onFocus={(e) => e.currentTarget.select()} />
              <Button variant="quiet" onClick={() => { void navigator.clipboard?.writeText(result.payment.url!).then(() => { setCopied(true); toast("Payment link copied", "ok"); }); }}>
                {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} Copy
              </Button>
            </div>
          ) : null}
          <p className="text-[12px] text-text-muted">The status updates here by itself when the customer pays.</p>
        </div>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (!bad) create.mutate(); }}>
          <div className="grid grid-cols-[1fr_96px] gap-3">
            <Field label="Amount" htmlFor="pay-amount"><Input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} required /></Field>
            <Field label="Currency" htmlFor="pay-cur"><Input id="pay-cur" value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} /></Field>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Presets">
            <Button type="button" size="sm" variant="quiet" onClick={() => setAmount("25000")}>Booking token 25,000</Button>
          </div>
          <Notice error={create.error} />
          <Button type="submit" disabled={create.isPending || bad || currency.length !== 3}>{create.isPending ? "Creating" : "Create & email link"}</Button>
        </form>
      )}
    </Dialog>
  );
}
