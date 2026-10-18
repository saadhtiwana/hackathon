"use client";

import { Suspense, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, Loader2 } from "lucide-react";
import { Lockup } from "@/components/brand/logo";
import { apiFetch } from "@/lib/api/client";
import { formatMoney } from "@/lib/format";

type Receipt = { reference: string; status: string; amountCents: number; currency: string; workspaceName: string; checkoutUrl: string | null };

// Public page Stripe sends customers back to. No sign-in, and only the receipt basics are shown.
export default function PayPage() {
  return (
    <Suspense fallback={null}>
      <PayInner />
    </Suspense>
  );
}

function PayInner() {
  const { paymentId } = useParams<{ paymentId: string }>();
  const outcome = useSearchParams().get("status");
  const [tries, setTries] = useState(0);
  const q = useQuery({
    queryKey: ["public-payment", paymentId],
    queryFn: async () => {
      setTries((n) => n + 1);
      return apiFetch<Receipt>(`/public/payments/${paymentId}`);
    },
    retry: false,
    // the webhook can land a moment after the redirect; keep checking briefly
    refetchInterval: (query) => (outcome === "success" && query.state.data?.status === "requested" && tries < 15 ? 2000 : false),
  });
  const r = q.data;
  const paid = r && ["paid", "partially_refunded", "refunded"].includes(r.status);
  const confirming = outcome === "success" && r?.status === "requested";

  return (
    <main id="content" className="flex min-h-full flex-col items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-[420px]">
        <p className="mb-8 flex justify-center">
          <Lockup size={32} />
        </p>
        <div className="rounded-xl border border-border bg-surface p-7 text-center shadow-raised sm:p-8" aria-live="polite">
          {q.isLoading ? (
            <Loader2 className="mx-auto size-6 animate-spin text-text-muted" aria-label="Loading" />
          ) : q.isError || !r ? (
            <>
              <CircleAlert className="mx-auto mb-3 size-8 text-danger" aria-hidden />
              <h1 className="text-[20px] font-semibold">We could not find this payment</h1>
              <p className="mt-2 text-[14px] text-text-muted">Check the link in your email, or contact the business that sent it.</p>
            </>
          ) : paid || confirming ? (
            <>
              {paid ? <CircleCheck className="mx-auto mb-3 size-9 text-ok" aria-hidden /> : <Loader2 className="mx-auto mb-3 size-8 animate-spin text-text-muted" aria-hidden />}
              <h1 className="text-[20px] font-semibold">{paid ? "Payment received. Thank you." : "Confirming your payment"}</h1>
              <p className="mt-2 text-[14px] text-text-muted">
                {paid ? `${r.workspaceName} will be in touch.` : "This takes a few seconds. You can close this page; we have your payment details."}
              </p>
              <Receipt r={r} />
            </>
          ) : outcome === "cancel" || r.status === "requested" ? (
            <>
              <CircleAlert className="mx-auto mb-3 size-8 text-warn" aria-hidden />
              <h1 className="text-[20px] font-semibold">Payment not completed</h1>
              <p className="mt-2 text-[14px] text-text-muted">No money was taken.</p>
              <Receipt r={r} />
              {r.checkoutUrl ? (
                <a href={r.checkoutUrl} className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-md bg-accent px-4 text-[14px] font-medium text-on-accent hover:bg-accent-hover">
                  Try again
                </a>
              ) : null}
            </>
          ) : (
            <>
              <CircleAlert className="mx-auto mb-3 size-8 text-text-muted" aria-hidden />
              <h1 className="text-[20px] font-semibold">This payment link is no longer open</h1>
              <p className="mt-2 text-[14px] text-text-muted">It has expired or was not completed. Ask {r.workspaceName} for a new link.</p>
              <Receipt r={r} />
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function Receipt({ r }: { r: Receipt }) {
  return (
    <dl className="mt-5 grid grid-cols-2 gap-y-2 rounded-lg bg-surface-muted p-4 text-left text-[13px]">
      <dt className="text-text-muted">Amount</dt>
      <dd className="text-right font-mono font-medium tabular-nums">{formatMoney(r.amountCents, r.currency)}</dd>
      <dt className="text-text-muted">Reference</dt>
      <dd className="text-right font-mono">{r.reference}</dd>
      <dt className="text-text-muted">Paid to</dt>
      <dd className="text-right">{r.workspaceName}</dd>
    </dl>
  );
}
