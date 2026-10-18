"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CircleCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { isApiError } from "@/lib/api";
import { leadsApi } from "./api";
import { Lockup } from "@/components/brand/logo";
import { useAgencyEmail } from "../agency/use-agency-email";

type Draft = { name: string; phone: string; email: string; message: string; website: string };
const empty: Draft = { name: "", phone: "", email: "", message: "", website: "" };

export function PublicLeadForm() {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const form = useQuery({
    queryKey: ["public-form", workspaceSlug],
    queryFn: () => leadsApi.publicForm(workspaceSlug),
    retry: false,
  });
  const agency = useAgencyEmail(workspaceSlug);
  const [draft, setDraft] = useState<Draft>(empty);
  const [localError, setLocalError] = useState<string | null>(null);
  const submit = useMutation({
    mutationFn: () =>
      leadsApi.submitPublic(workspaceSlug, {
        name: draft.name.trim(),
        phone: draft.phone.trim() || undefined,
        email: draft.email.trim() || undefined,
        message: draft.message.trim() || undefined,
        website: draft.website || undefined,
      }),
  });

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  const fields = isApiError(submit.error) ? (submit.error.fields ?? {}) : {};
  const submitMessage = isApiError(submit.error)
    ? submit.error.status === 429
      ? "Too many requests from this connection. Please try again in a minute."
      : submit.error.status === 0
        ? "We could not reach the server. Check your connection and try again."
        : submit.error.message
    : submit.error
      ? "Something went wrong. Please try again."
      : null;

  return (
    <main id="content" className="flex min-h-full items-start justify-center bg-canvas px-4 py-8 sm:items-center sm:py-12">
      <div className="w-full max-w-[460px] rounded-xl border border-border bg-surface p-6 shadow-raised animate-fade-in sm:p-8">
        {form.isLoading ? (
          <div className="flex flex-col gap-3" aria-label="Loading form">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : form.isError ? (
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight">This form is not available</h1>
            <p className="mt-1 text-[13px] text-text-muted">Check the link you were given, or contact the business directly.</p>
          </div>
        ) : submit.isSuccess ? (
          <div className="flex flex-col items-start gap-3" role="status">
            <span className="inline-flex size-11 items-center justify-center rounded-full bg-tint-green text-tint-green-text" aria-hidden>
              <CircleCheck className="size-6" />
            </span>
            <h1 className="text-[22px] font-semibold tracking-tight">Thank you, {draft.name.trim().split(/\s+/)[0] || "we got it"}</h1>
            <p className="text-[13px] text-text-muted">
              {form.data?.workspaceName} has your request. Someone specific is now responsible for it and will get back to you soon.
            </p>
            <Button
              variant="quiet"
              size="sm"
              onClick={() => {
                setDraft(empty);
                submit.reset();
              }}
            >
              Send another request
            </Button>
          </div>
        ) : (
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.name.trim()) return setLocalError("Please tell us your name.");
              if (!draft.phone.trim() && !draft.email.trim()) return setLocalError("Leave a phone number or an email so we can reach you.");
              setLocalError(null);
              submit.mutate();
            }}
          >
            <div className="mb-1">
              <Lockup size={32} className="mb-4" />
              <h1 className="text-[24px] leading-tight font-semibold tracking-tight">Talk to {form.data?.workspaceName}</h1>
              <p className="mt-1.5 text-[14px] text-text-muted">Tell us what you need. A real person picks it up and gets back to you.</p>
            </div>
            <Field label="Your name" htmlFor="pf-name" error={fields.name}>
              <Input className="h-11" id="pf-name" autoComplete="name" required maxLength={200} value={draft.name} onChange={set("name")} />
            </Field>
            <Field label="Phone" hint="Include the country code, for example +92 300 1234567" htmlFor="pf-phone" error={fields.phone}>
              <Input className="h-11" id="pf-phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={40} value={draft.phone} onChange={set("phone")} />
            </Field>
            <Field label="Email" htmlFor="pf-email" error={fields.email}>
              <Input className="h-11" id="pf-email" type="email" autoComplete="email" maxLength={320} value={draft.email} onChange={set("email")} />
            </Field>
            <Field label="What do you need?" htmlFor="pf-message" error={fields.message}>
              <Textarea id="pf-message" maxLength={5000} value={draft.message} onChange={set("message")} />
            </Field>
            {/* honeypot: hidden from people and assistive tech, bots tend to fill it */}
            <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
              <label htmlFor="pf-website">Website</label>
              <input id="pf-website" tabIndex={-1} autoComplete="off" value={draft.website} onChange={set("website")} />
            </div>
            {localError || submitMessage ? (
              <p className="text-[13px] text-danger" role="alert">
                {localError ?? submitMessage}
              </p>
            ) : null}
            <Button type="submit" disabled={submit.isPending} className="h-11 w-full text-[14px]">
              {submit.isPending ? "Sending" : "Send request"}
            </Button>
            <p className="flex items-center justify-center gap-1.5 text-[12px] text-text-muted">
              <Clock className="size-3.5" aria-hidden />
              Usually answered within a few minutes
            </p>
            {agency.data?.email ? (
              <p className="text-center text-[12px] text-text-muted">
                Or email us at <a className="font-medium text-text underline" href={`mailto:${agency.data.email}`}>{agency.data.email}</a>
              </p>
            ) : null}
          </form>
        )}
      </div>
    </main>
  );
}
