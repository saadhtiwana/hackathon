"use client";

import { useState } from "react";
import { Copy, Info, Send, TimerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Notice } from "@/components/ui/notice";
import { useToast } from "@/components/ui/toast";
import { isApiError } from "@/lib/api";
import { useExpirePayment, usePaymentDetail, useSendPayment, type PaymentRow } from "../api";

function explain(e: unknown) {
  if (!isApiError(e)) return "Something went wrong. Try again.";
  return e.hint ? `${e.message} ${e.hint}` : e.message;
}

export function PaymentActions({ payment, canEdit }: { payment: PaymentRow; canEdit: boolean }) {
  const toast = useToast();
  const send = useSendPayment();
  const open = payment.status === "requested" && !!payment.url;

  async function copy() {
    try {
      await navigator.clipboard.writeText(payment.url!);
      toast("Payment link copied", "ok");
    } catch {
      toast("Could not copy. Select the link in Details and copy it by hand.", "signal");
    }
  }

  return (
    <span className="inline-flex flex-wrap justify-end gap-1">
      {open ? (
        <Button size="sm" variant="ghost" onClick={() => void copy()}>
          <Copy className="size-3.5" aria-hidden />
          Copy link
        </Button>
      ) : null}
      {open && canEdit ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={send.isPending}
          onClick={() =>
            send.mutate(payment.id, {
              onSuccess: () => toast(`Link sent to ${payment.contactName ?? "the customer"} by email`, "ok"),
              onError: (e) => toast(`Not sent. ${explain(e)}`, "signal"),
            })
          }
        >
          <Send className="size-3.5" aria-hidden />
          {send.isPending ? "Sending" : "Send to customer"}
        </Button>
      ) : null}
      {open && canEdit ? <ExpireButton payment={payment} /> : null}
      <DetailsButton payment={payment} />
    </span>
  );
}

function ExpireButton({ payment }: { payment: PaymentRow }) {
  const [open, setOpen] = useState(false);
  const expire = useExpirePayment();
  const toast = useToast();
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) expire.reset();
      }}
      trigger={
        <Button size="sm" variant="ghost">
          <TimerOff className="size-3.5" aria-hidden />
          Expire
        </Button>
      }
      title="Expire this payment link?"
      description="The customer will no longer be able to pay with it. You can request a new payment afterwards."
    >
      <Notice error={expire.error} />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="quiet" onClick={() => setOpen(false)}>
          Keep it open
        </Button>
        <Button
          variant="signal"
          disabled={expire.isPending}
          onClick={() =>
            expire.mutate(payment.id, {
              onSuccess: () => {
                toast("Payment link expired", "ok");
                setOpen(false);
              },
            })
          }
        >
          {expire.isPending ? "Expiring" : "Expire link"}
        </Button>
      </div>
    </Dialog>
  );
}

function DetailsButton({ payment }: { payment: PaymentRow }) {
  const [open, setOpen] = useState(false);
  const detail = usePaymentDetail(payment.id, open);
  const ref = detail.data?.providerRef;
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button size="sm" variant="ghost" aria-label={`Details for payment from ${payment.contactName ?? "customer"}`}>
          <Info className="size-3.5" aria-hidden />
          Details
        </Button>
      }
      title="Payment details"
    >
      {detail.isLoading ? (
        <p className="text-[13px] text-text-muted">Loading the provider reference</p>
      ) : detail.isError ? (
        <Notice error={detail.error} onRetry={() => void detail.refetch()} />
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
          <dt className="text-text-muted">Provider</dt>
          <dd className="capitalize">{ref?.provider ?? "Stripe"}</dd>
          <dt className="text-text-muted">Checkout session</dt>
          <dd className="break-all tabular-nums">{ref?.sessionId ?? "–"}</dd>
          <dt className="text-text-muted">Payment intent</dt>
          <dd className="break-all tabular-nums">{ref?.paymentIntentId ?? "Not paid yet"}</dd>
          <dt className="text-text-muted">Requested by</dt>
          <dd>{detail.data?.requestedBy?.name ?? payment.requestedByName ?? "System"}</dd>
          {payment.failureReason ? (
            <>
              <dt className="text-text-muted">Why it failed</dt>
              <dd className="text-danger">{payment.failureReason}</dd>
            </>
          ) : null}
          {payment.url ? (
            <>
              <dt className="text-text-muted">Link</dt>
              <dd className="break-all">{payment.url}</dd>
            </>
          ) : null}
        </dl>
      )}
    </Dialog>
  );
}
