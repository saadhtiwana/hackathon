"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Mail } from "lucide-react";
import { useMe } from "@/components/session";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fieldErrors, Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api/client";
import { useCalendars } from "./api";

type Prefs = { alertEmail: string | null; effectiveEmail: string; notifyOnEscalation: boolean; notifyOnMessage: boolean };
const key = ["me", "notifications"] as const;

export function NotificationsPage() {
  const prefs = useQuery({ queryKey: key, queryFn: () => apiFetch<Prefs>("/me/notifications") });
  return (
    <>
      <Breadcrumbs items={[{ href: "/", label: "Desk" }, { label: "Notifications" }]} />
      <PageHeader title="Notifications" description="Where Relay reaches you when a lead escalates to you, and your calendar for bookings." />
      <div className="flex max-w-2xl flex-col gap-6">
        {prefs.isLoading ? (
          <Skeleton className="h-48 w-full rounded-xl" />
        ) : prefs.isError || !prefs.data ? (
          <div className="flex flex-col items-start gap-3">
            <Notice error={prefs.error} />
            <Button size="sm" variant="quiet" onClick={() => void prefs.refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <AlertSettings initial={prefs.data} />
        )}
        <MyCalendar />
      </div>
    </>
  );
}

function AlertSettings({ initial }: { initial: Prefs }) {
  const [email, setEmail] = useState(initial.alertEmail ?? "");
  const qc = useQueryClient();
  const toast = useToast();
  const save = useMutation({
    mutationFn: (body: Partial<Pick<Prefs, "alertEmail" | "notifyOnEscalation" | "notifyOnMessage">>) => apiFetch<Prefs>("/me/notifications", { method: "PUT", body }),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
  const errors = fieldErrors(save.error) ?? {};
  const current = qc.getQueryData<Prefs>(key) ?? initial;

  return (
    <Card>
      <CardHeader title="Alert email" description="Escalations are emailed here within the same minute, with a link straight to the lead." />
      <form
        className="flex flex-col gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({ alertEmail: email.trim() || null }, { onSuccess: () => toast(email.trim() ? `Alerts now go to ${email.trim()}` : "Alerts go to your login email", "ok") });
        }}
      >
        <Field label="Send my alerts to" hint={`Leave empty to use your login email (${current.effectiveEmail})`} htmlFor="alert-email" error={errors.alertEmail}>
          <Input id="alert-email" type="email" autoComplete="email" placeholder={current.effectiveEmail} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <p className="flex items-center gap-2 text-[13px] text-text-muted">
          <Mail className="size-4" aria-hidden />
          Currently sending to <span className="font-medium text-text">{current.effectiveEmail}</span>
        </p>
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <Toggle
            id="n-esc"
            label="Email me when a lead escalates to me"
            checked={current.notifyOnEscalation}
            disabled={save.isPending}
            onChange={(v) => save.mutate({ notifyOnEscalation: v }, { onSuccess: () => toast(v ? "Escalation emails on" : "Escalation emails off", "ok") })}
          />
          <Toggle
            id="n-msg"
            label="Email me when a customer replies to my conversation"
            checked={current.notifyOnMessage}
            disabled={save.isPending}
            onChange={(v) => save.mutate({ notifyOnMessage: v }, { onSuccess: () => toast(v ? "Message emails on" : "Message emails off", "ok") })}
          />
        </div>
        <Notice error={save.error} />
        <div className="flex gap-2">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving" : "Save email"}
          </Button>
          {current.alertEmail ? (
            <Button variant="ghost" onClick={() => {
              setEmail("");
              save.mutate({ alertEmail: null }, { onSuccess: () => toast("Alerts go to your login email", "ok") });
            }}>
              Use my login email
            </Button>
          ) : null}
        </div>
      </form>
    </Card>
  );
}

function Toggle({ id, label, checked, disabled, onChange }: { id: string; label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

function MyCalendar() {
  const me = useMe();
  const calendars = useCalendars(me.isSuccess);
  const mine = calendars.data?.items.find((c) => c.userId === me.data?.user.id);
  const status = mine?.status ?? (me.data?.googleConnected ? "connected" : "not_connected");
  return (
    <Card>
      <CardHeader title="My Google Calendar" description="Customers can only be booked with you once your calendar is connected." />
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <span className="flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-lg bg-tint-blue text-tint-blue-text" aria-hidden>
            <CalendarDays className="size-5" />
          </span>
          {calendars.isLoading ? (
            <Skeleton className="h-5 w-32" />
          ) : status === "connected" ? (
            <Badge tone="ok">Connected</Badge>
          ) : status === "needs_reconnect" ? (
            <Badge tone="signal">Connection expired</Badge>
          ) : (
            <Badge>Not connected</Badge>
          )}
        </span>
        {/* full page load: the backend redirects to Google's consent screen */}
        <Button asChild variant={status === "connected" ? "quiet" : "primary"}>
          <a href="/api/integrations/google/connect?purpose=calendar">{status === "connected" ? "Reconnect calendar" : "Connect my Google Calendar"}</a>
        </Button>
      </div>
      {calendars.isError ? (
        <div className="px-5 pb-5">
          <Notice error={calendars.error} />
        </div>
      ) : null}
    </Card>
  );
}
