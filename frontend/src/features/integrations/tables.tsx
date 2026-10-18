"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Copy } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, type Column } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { useAlerts, useCalendarPeople, useConnectLink, useSyncHistory, type Alert, type CalendarMember, type SyncEvent } from "./api";

const t = (iso: string) => format(new Date(iso), "d MMM, HH:mm:ss");
const resultTone = (r: string) => (r === "ok" ? "ok" : r === "duplicate" || r === "rejected" ? "neutral" : "signal") as "ok" | "neutral" | "signal";

const providers = [
  { value: "stripe", label: "Stripe" },
  { value: "email", label: "Email" },
  { value: "google_calendar", label: "Google Calendar" },
];

export function SyncHistory() {
  const [provider, setProvider] = useState("stripe");
  const history = useSyncHistory(provider);
  const rows = history.data?.pages.flatMap((p) => p.items) ?? [];
  const columns: Column<SyncEvent>[] = [
    { key: "at", header: "When", render: (e) => <span className="tabular-nums text-text-muted">{t(e.createdAt)}</span> },
    { key: "dir", header: "Direction", render: (e) => (e.direction === "in" ? "Incoming" : "Outgoing") },
    { key: "type", header: "Event", render: (e) => <span className="font-medium">{e.type}</span> },
    {
      key: "result",
      header: "Result",
      render: (e) => (
        <Badge tone={resultTone(e.result)}>
          {e.result === "rejected" ? "Rejected (invalid signature)" : e.result}
          {e.httpStatus ? ` · ${e.httpStatus}` : ""}
        </Badge>
      ),
    },
    { key: "error", header: "Detail", render: (e) => <span className={e.error ? "text-danger" : "text-text-muted"}>{e.error ?? e.ref ?? "–"}</span> },
  ];
  return (
    <Card>
      <CardHeader title="Sync history" description="Every call to and from each provider, newest first." actions={<Select label="Provider" value={provider} onValueChange={setProvider} options={providers} />} />
      <div className="p-5">
        {history.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : history.isError ? (
          <Notice error={history.error} onRetry={() => void history.refetch()} />
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-text-muted">Nothing recorded for this provider yet.</p>
        ) : (
          <>
            <Table caption="Sync history" columns={columns} rows={rows} rowKey={(e) => e.id} pageSize={10} />
            {history.hasNextPage ? (
              <Button size="sm" variant="quiet" className="mt-3" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>
                {history.isFetchingNextPage ? "Loading" : "Load older events"}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}

export function FailedAlerts() {
  const alerts = useAlerts(true);
  const rows = (alerts.data?.items ?? []).filter((a) => a.status !== "delivered");
  const columns: Column<Alert>[] = [
    { key: "at", header: "When", render: (a) => <span className="tabular-nums text-text-muted">{t(a.at)}</span> },
    {
      key: "to",
      header: "For",
      render: (a) => (
        <span className="inline-flex items-center gap-2">
          <Avatar name={a.toUserName ?? "Unknown"} id={a.toUserId ?? undefined} size="xs" />
          {a.toUserName ?? "Unknown"}
        </span>
      ),
    },
    { key: "kind", header: "Alert", render: (a) => a.kind.replace("notify.", "").replace("alert.", "").replace("_", " ") },
    {
      key: "status",
      header: "Status",
      render: (a) => (
        <Badge tone={a.status === "retrying" ? "warn" : "signal"}>
          {a.status === "retrying" ? `Retrying${a.attempts != null ? ` (${a.attempts}/${a.maxAttempts})` : ""}` : a.status === "failed" ? "Gave up" : "Not delivered"}
        </Badge>
      ),
    },
    { key: "error", header: "Why", render: (a) => <span className="text-danger">{a.error ?? "–"}</span> },
  ];
  return (
    <Card>
      <CardHeader title="Failed alerts" description="Escalation emails that did not reach the new owner." />
      <div className="p-5">
        {alerts.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : alerts.isError ? (
          <Notice error={alerts.error} onRetry={() => void alerts.refetch()} />
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-ok">Every alert was delivered.</p>
        ) : (
          <Table caption="Failed alerts" columns={columns} rows={rows} rowKey={(a) => a.id} pageSize={8} />
        )}
      </div>
    </Card>
  );
}

const calStatus = {
  connected: { tone: "ok", label: "Connected" },
  not_connected: { tone: "neutral", label: "Not connected" },
  needs_reconnect: { tone: "signal", label: "Needs reconnecting" },
} as const;

export function CalendarPeople({ canManage }: { canManage: boolean }) {
  const people = useCalendarPeople();
  const link = useConnectLink();
  const toast = useToast();
  const columns: Column<CalendarMember>[] = [
    {
      key: "who",
      header: "Employee",
      render: (m) => (
        <span className="inline-flex items-center gap-2">
          <Avatar name={m.name} id={m.userId} size="sm" />
          <span>
            <span className="block font-medium">{m.name}</span>
            {m.account ? <span className="block text-[12px] text-text-muted">{m.account}</span> : null}
          </span>
        </span>
      ),
    },
    { key: "status", header: "Calendar", render: (m) => <Badge tone={calStatus[m.status].tone}>{calStatus[m.status].label}</Badge> },
    { key: "why", header: "", render: (m) => <span className="text-text-muted">{m.reason ?? "Can be booked"}</span> },
    {
      key: "action",
      header: "",
      align: "right",
      render: (m) =>
        canManage && m.status !== "connected" ? (
          <Button
            size="sm"
            variant="quiet"
            disabled={link.isPending}
            onClick={() =>
              link.mutate(
                { userId: m.userId, purpose: "calendar" },
                {
                  onSuccess: async (r) => {
                    try {
                      await navigator.clipboard.writeText(r.url);
                      toast(`Connect link for ${m.name} copied. Send it to them; it expires soon.`, "ok");
                    } catch {
                      toast(`Link: ${r.url}`, "neutral");
                    }
                  },
                  onError: (e) => toast(e.message, "signal"),
                },
              )
            }
          >
            <Copy className="size-3.5" aria-hidden />
            Copy connect link
          </Button>
        ) : null,
    },
  ];
  return (
    <Card>
      <CardHeader title="Employee calendars" description="Only people with a connected calendar can be booked." />
      <div className="p-5">
        {people.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : people.isError ? (
          <Notice error={people.error} onRetry={() => void people.refetch()} />
        ) : (
          <Table caption="Employee calendars" columns={columns} rows={people.data?.items ?? []} rowKey={(m) => m.userId} pageSize={10} />
        )}
      </div>
    </Card>
  );
}
