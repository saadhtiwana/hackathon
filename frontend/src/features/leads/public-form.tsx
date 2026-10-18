"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { isApiError } from "@/lib/api";
import { leadsApi } from "./api";

type Draft = { name: string; phone: string; email: string; message: string; website: string };
const empty: Draft = { name: "", phone: "", email: "", message: "", website: "" };

export function PublicLeadForm() {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const form = useQuery({
    queryKey: ["public-form", workspaceSlug],
    queryFn: () => leadsApi.publicForm(workspaceSlug),
    retry: false,
  });
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
    <main id="content" className="flex min-h-full items-start justify-center bg-wash px-4 py-10 sm:items-center">
      <div className="w-full max-w-[440px] rounded-lg border border-line bg-surface p-6 shadow-float">
        {form.isLoading ? (
          <div className="flex flex-col gap-3" aria-label="Loading form">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : form.isError ? (
          <div>
            <h1 className="text-[18px] font-medium">This form is not available</h1>
            <p className="mt-1 text-[13px] text-muted">Check the link you were given, or contact the business directly.</p>
          </div>
        ) : submit.isSuccess ? (
          <div className="flex flex-col items-start gap-3" role="status">
            <CircleCheck className="size-6 text-ok" aria-hidden />
            <h1 className="text-[18px] font-medium">Thank you, {draft.name.trim().split(/\s+/)[0] || "we got it"}</h1>
            <p className="text-[13px] text-muted">
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
            <div>
              <h1 className="text-[18px] font-medium">Contact {form.data?.workspaceName}</h1>
              <p className="mt-1 text-[13px] text-muted">Tell us what you need and we will get back to you.</p>
            </div>
            <Field label="Your name" htmlFor="pf-name" error={fields.name}>
              <Input id="pf-name" autoComplete="name" required maxLength={200} value={draft.name} onChange={set("name")} />
            </Field>
            <Field label="Phone" hint="Include the country code, for example +92 300 1234567" htmlFor="pf-phone" error={fields.phone}>
              <Input id="pf-phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={40} value={draft.phone} onChange={set("phone")} />
            </Field>
            <Field label="Email" htmlFor="pf-email" error={fields.email}>
              <Input id="pf-email" type="email" autoComplete="email" maxLength={320} value={draft.email} onChange={set("email")} />
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
              <p className="text-[13px] text-signal" role="alert">
                {localError ?? submitMessage}
              </p>
            ) : null}
            <Button type="submit" disabled={submit.isPending} className="w-full">
              {submit.isPending ? "Sending" : "Send request"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
