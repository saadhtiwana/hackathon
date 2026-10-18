"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { fieldErrors, Notice } from "@/components/ui/notice";
import { NativeSelect } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { isApiError } from "@/lib/api";
import { useCreatePayment } from "../api";

const currencies = ["PKR", "USD", "EUR", "GBP", "AED"];

export function RequestPayment({ opportunityId, defaultCurrency = "PKR" }: { opportunityId: string; defaultCurrency?: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [description, setDescription] = useState("");
  const create = useCreatePayment();
  const toast = useToast();
  const errors = fieldErrors(create.error) ?? {};
  const notConnected = isApiError(create.error) && create.error.code === "stripe_not_connected";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return;
    create.mutate(
      { opportunityId, amount: value, currency, description: description.trim() || undefined },
      {
        onSuccess: () => {
          toast("Payment request created. Copy or send the link next.", "ok");
          setOpen(false);
          setAmount("");
          setDescription("");
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) create.reset();
      }}
      trigger={
        <Button size="sm">
          <Plus className="size-3.5" aria-hidden />
          Request payment
        </Button>
      }
      title="Request a payment"
      description="Creates a Stripe Checkout link. Card details are entered on Stripe and never reach Relay."
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-[1fr_110px] gap-3">
          <Field label="Amount" htmlFor="pay-amount" error={errors.amount ?? errors.amountCents}>
            <Input id="pay-amount" type="number" inputMode="decimal" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className="tabular-nums" />
          </Field>
          <Field label="Currency" htmlFor="pay-currency" error={errors.currency}>
            <NativeSelect id="pay-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {currencies.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <Field label="What it is for" hint="Optional, shown to the customer" htmlFor="pay-desc">
          <Input id="pay-desc" maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {notConnected ? (
          <p className="text-[13px] text-danger" role="alert">
            Stripe is not connected for this workspace. An admin can connect it in Settings, Integrations.
          </p>
        ) : (
          <Notice error={create.error} />
        )}
        <div className="flex justify-end gap-2">
          <Button variant="quiet" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending || !amount}>
            {create.isPending ? "Creating link" : "Create link"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
