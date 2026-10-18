"use client";

import { useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { Bell, CalendarDays, Check, CreditCard, Mail, Plug, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { fieldErrors, Notice } from "@/components/ui/notice";
import { StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { useConnect, useDisconnect, useTest, type Integration } from "./api";

const icons: Record<string, typeof Plug> = { stripe: CreditCard, email: Mail, google_calendar: CalendarDays, email_alerts: Bell };
const ago = (iso: string | null) => (iso ? `${formatDistanceToNowStrict(new Date(iso))} ago` : "never");

export function ProviderCard({ item, canManage, retired }: { item: Integration; canManage: boolean; retired?: boolean }) {
  const Icon = icons[item.provider] ?? Plug;
  const test = useTest();
  const connect = useConnect();
  const toast = useToast();
  const status = retired ? "not_connected" : item.status;

  function oauth() {
    connect.mutate(
      { provider: item.provider },
      {
        onSuccess: (r) => {
          if (r.authUrl) window.location.assign(r.authUrl);
          else toast(`${item.label} connected`, "ok");
        },
        onError: (e) => toast(`${e.message}${"hint" in e && e.hint ? ` ${e.hint}` : ""}`, "signal"),
      },
    );
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-text" aria-hidden>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold">{item.label}</h2>
          <p className="text-[13px] text-text-muted">{retired ? "No longer used. Customer messaging moved to email." : item.limits.summary}</p>
          {item.provider === "email" && (item as { agencyAddress?: string | null }).agencyAddress ? (
            <p className="mt-1 text-[12px] text-text-muted">
              Customers write to <span className="font-mono">{(item as { agencyAddress?: string | null }).agencyAddress}</span>
            </p>
          ) : null}
        </div>
        {status === "connected" ? (
          <StatusPill tone="ok">Connected</StatusPill>
        ) : status === "error" ? (
          <StatusPill tone="signal">Needs attention</StatusPill>
        ) : (
          <StatusPill tone="neutral">Not connected</StatusPill>
        )}
      </div>

      {!retired ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
          {item.perUser ? (
            <>
              <dt className="text-text-muted">Calendars connected</dt>
              <dd className="tabular-nums">
                {item.connectedUsers ?? 0}
                {item.needsReconnect ? <span className="text-danger"> · {item.needsReconnect} need reconnecting</span> : null}
              </dd>
            </>
          ) : (
            <>
              <dt className="text-text-muted">Last worked</dt>
              <dd>{ago(item.lastOkAt)}</dd>
              <dt className="text-text-muted">Key</dt>
              <dd className="tabular-nums">{item.secretMasked ?? "None stored"}</dd>
            </>
          )}
          {item.lastError ? (
            <>
              <dt className="text-text-muted">Last error</dt>
              <dd className="text-danger">
                {item.lastError} <span className="text-text-muted">({ago(item.lastErrorAt)})</span>
              </dd>
            </>
          ) : null}
        </dl>
      ) : null}

      {!retired && item.recentErrors.length ? (
        <details className="rounded-lg bg-surface-muted px-3 py-2 text-[13px]">
          <summary className="cursor-pointer font-medium">Recent errors ({item.recentErrors.length})</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {item.recentErrors.map((e) => (
              <li key={`${e.at}-${e.type}`} className="text-text-muted">
                <span className="tabular-nums">{ago(e.at)}</span> · {e.type}: <span className="text-danger">{e.message}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {!retired ? (
        <div className="grid gap-3 text-[13px] sm:grid-cols-2">
          <div>
            <p className="mb-1 font-medium">It can</p>
            <ul className="flex flex-col gap-1">
              {item.limits.can.map((t) => (
                <li key={t} className="flex gap-1.5">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-ok" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1 font-medium">It can&apos;t</p>
            <ul className="flex flex-col gap-1 text-text-muted">
              {item.limits.cannot.map((t) => (
                <li key={t} className="flex gap-1.5">
                  <X className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {canManage && !retired ? (
        <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-4">
          {item.provider === "stripe" ? (
            <StripeConnect connected={status === "connected"} />
          ) : (
            <Button size="sm" variant={status === "connected" ? "quiet" : "primary"} disabled={connect.isPending} onClick={oauth}>
              {connect.isPending ? "Opening Google" : item.perUser ? "Connect my calendar" : status === "connected" ? "Reconnect" : "Connect mailbox"}
            </Button>
          )}
          {status !== "not_connected" && !item.perUser ? (
            <Button
              size="sm"
              variant="quiet"
              disabled={test.isPending}
              onClick={() =>
                test.mutate(item.provider, {
                  onSuccess: () => toast(`${item.label} answered. The connection works.`, "ok"),
                  onError: (e) => toast(`Test failed: ${e.message}`, "signal"),
                })
              }
            >
              {test.isPending ? "Testing" : "Test"}
            </Button>
          ) : null}
          {status !== "not_connected" && !item.perUser ? <DisconnectButton item={item} /> : null}
        </div>
      ) : null}
      {!canManage && !retired ? <p className="text-[12px] text-text-muted">Only people with Manage integrations can connect or change this.</p> : null}
    </Card>
  );
}

function StripeConnect({ connected }: { connected: boolean }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const connect = useConnect();
  const toast = useToast();
  const errors = fieldErrors(connect.error) ?? {};
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          connect.reset();
          setKey("");
        }
      }}
      trigger={
        <Button size="sm" variant={connected ? "quiet" : "primary"}>
          {connected ? "Replace key" : "Connect Stripe"}
        </Button>
      }
      title="Connect Stripe"
      description="Paste a test-mode secret key. It is encrypted at rest and only the last four characters are ever shown."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          connect.mutate(
            { provider: "stripe", body: { secretKey: key.trim() } },
            {
              onSuccess: () => {
                toast("Stripe connected", "ok");
                setOpen(false);
              },
            },
          );
        }}
      >
        <Field label="Secret key" hint="Starts with sk_test_" htmlFor="stripe-key" error={errors.secretKey}>
          <Input id="stripe-key" type="password" autoComplete="off" required value={key} onChange={(e) => setKey(e.target.value)} />
        </Field>
        <Notice error={connect.error} />
        <div className="flex justify-end gap-2">
          <Button variant="quiet" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={!key.trim() || connect.isPending}>
            {connect.isPending ? "Checking the key" : "Connect"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function DisconnectButton({ item }: { item: Integration }) {
  const [open, setOpen] = useState(false);
  const disconnect = useDisconnect();
  const toast = useToast();
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) disconnect.reset();
      }}
      trigger={
        <Button size="sm" variant="ghost">
          Disconnect
        </Button>
      }
      title={`Disconnect ${item.label}?`}
      description="Stored credentials are deleted. Anything that depends on it stops until it is connected again."
    >
      <Notice error={disconnect.error} />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="quiet" onClick={() => setOpen(false)}>
          Keep connected
        </Button>
        <Button
          variant="signal"
          disabled={disconnect.isPending}
          onClick={() =>
            disconnect.mutate(item.provider, {
              onSuccess: () => {
                toast(`${item.label} disconnected`, "ok");
                setOpen(false);
              },
            })
          }
        >
          {disconnect.isPending ? "Disconnecting" : "Disconnect"}
        </Button>
      </div>
    </Dialog>
  );
}

export function MissingProviderCard({ label }: { label: string }) {
  return (
    <Card className="flex flex-col gap-2 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">{label}</h2>
        <Badge>Unavailable</Badge>
      </div>
      <p className="text-[13px] text-text-muted">The server does not offer this integration yet. It appears here once the backend supports it.</p>
    </Card>
  );
}
