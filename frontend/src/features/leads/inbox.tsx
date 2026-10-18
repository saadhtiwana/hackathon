"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { AlarmClock, Check, CircleCheck, Clock, UserX } from "lucide-react";
import { useMe } from "@/components/session";
import { presence } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Countdown } from "@/components/ui/countdown";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { Table, type Column } from "@/components/ui/table";
import { TeamStrip } from "@/components/ui/team-strip";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { can } from "@/lib/permissions";
import { useAcknowledge, useLeads, useMemberNames, useMembers, type Lead, type LeadStatus } from "./api";
import { LeadStatusPill, SourceLabel } from "./components/labels";
import { Owner } from "./components/owner";
import { useServerNow } from "./time";

type StatusFilter = "open" | "all" | LeadStatus;

const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "assigned", label: "Waiting for ack" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "unassigned", label: "No owner" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All statuses" },
];

const FRESH_MS = 8_000;

export function LeadsInbox() {
  const me = useMe();
  const canAll = can(me.data, "leads.reassign");
  const [scopeChoice, setScope] = useState<"mine" | "all" | null>(null);
  const scope = scopeChoice ?? (canAll ? "all" : "mine");
  const params = useSearchParams();
  const created = params.get("created") as "today" | "week" | "month" | null;
  const escalated = params.get("escalated") === "24h";
  const statusParam = params.get("status") as StatusFilter | null;
  const [status, setStatus] = useState<StatusFilter>(statusParam && statusOptions.some((o) => o.value === statusParam) ? statusParam : created || escalated ? "all" : "open");

  const serverStatus = status === "open" || status === "all" ? undefined : status;
  const leads = useLeads({ status: serverStatus, mine: scope === "mine" }, me.isSuccess);
  const now = useServerNow();
  const since = created && now ? startOf(created, now) : null;
  const rows = (leads.data?.items ?? [])
    .filter((l) => status !== "open" || l.status !== "closed")
    .filter((l) => !since || new Date(l.createdAt).getTime() >= since)
    // automatic escalations move the lead to a higher level and reset assignedAt
    .filter((l) => !escalated || (l.escalationLevel > 0 && !!l.assignedAt && now - new Date(l.assignedAt).getTime() <= 86_400_000));
  const drill = created ? `Created ${created === "today" ? "today" : `this ${created}`}` : escalated ? "Escalated in the last 24 hours" : null;

  const nameOf = useMemberNames();
  const ack = useAcknowledge();
  const toast = useToast();
  const myId = me.data?.user.id;

  const columns: Column<Lead>[] = [
    {
      key: "contact",
      header: "Contact",
      sortValue: (l) => l.contactName ?? "",
      render: (l) => {
        const fresh = now > 0 && now - new Date(l.createdAt).getTime() < FRESH_MS;
        return (
          <span className={cn("-mx-1.5 inline-flex items-center gap-2 rounded-md px-1.5 py-0.5 transition-colors duration-700", fresh && "bg-accent-soft")}>
            <Link href={`/leads/${l.id}`} className="font-medium hover:underline">
              {l.contactName || "Unnamed contact"}
            </Link>
            {fresh ? <Badge tone="accent">New</Badge> : null}
          </span>
        );
      },
    },
    { key: "source", header: "Source", render: (l) => <SourceLabel source={l.source} /> },
    {
      key: "status",
      header: "Status",
      sortValue: (l) => l.status,
      render: (l) => (
        <span className="inline-flex items-center gap-2">
          <LeadStatusPill status={l.status} />
          {l.ownerAway ? <Badge tone="warn">Owner away</Badge> : null}
        </span>
      ),
    },
    {
      key: "owner",
      header: "Owner",
      sortValue: (l) => nameOf(l.ownerId),
      render: (l) => <Owner id={l.ownerId} me={myId} />,
    },
    {
      key: "deadline",
      header: "Time to ack",
      sortValue: (l) => (l.status === "assigned" && l.ackDeadline ? new Date(l.ackDeadline).getTime() : Number.MAX_SAFE_INTEGER),
      render: (l) =>
        l.status === "assigned" && l.ackDeadline ? (
          <Countdown deadline={l.ackDeadline} startedAt={l.assignedAt} />
        ) : (
          <span className="text-faint" aria-label="No timer">–</span>
        ),
    },
    {
      key: "escalations",
      header: "Escalations",
      align: "right",
      sortValue: (l) => l.escalationCount,
      render: (l) => (
        <Badge tone={l.escalationCount >= 2 ? "signal" : l.escalationCount === 1 ? "warn" : "neutral"}>{l.escalationCount}</Badge>
      ),
    },
    {
      key: "action",
      header: "",
      align: "right",
      render: (l) =>
        l.status === "assigned" && l.ownerId === myId ? (
          <Button
            size="sm"
            disabled={ack.isPending && ack.variables === l.id}
            onClick={() =>
              ack.mutate(l.id, {
                onSuccess: () => toast("Acknowledged. The lead is yours.", "ok"),
                onError: (e) => toast(e.message, "signal"),
              })
            }
          >
            <Check className="size-3.5" aria-hidden />
            Acknowledge
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Leads"
        description="One owner, one countdown, one next step."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canAll ? (
              <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Whose leads">
                {(["mine", "all"] as const).map((s) => (
                  <Button key={s} size="sm" variant={scope === s ? "dark" : "ghost"} aria-pressed={scope === s} onClick={() => setScope(s)}>
                    {s === "mine" ? "My leads" : "Everyone"}
                  </Button>
                ))}
              </div>
            ) : null}
            <Select label="Status" value={status} onValueChange={(v) => setStatus(v as StatusFilter)} options={statusOptions} />
          </div>
        }
      />

      {drill ? (
        <p className="mb-4">
          <Link href="/leads" className="inline-flex h-8 items-center gap-2 rounded-full bg-accent-soft px-3 text-[13px] font-medium text-accent-text hover:opacity-90">
            {drill}
            <X className="size-3.5" aria-label="Clear filter" />
          </Link>
        </p>
      ) : null}

      <InboxOverview leads={leads.data?.items} now={now} />

      {leads.isLoading || me.isLoading ? (
        <div className="flex flex-col gap-2" aria-label="Loading leads">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : leads.isError ? (
        <div className="flex flex-col items-start gap-3">
          <Notice error={leads.error} />
          <Button variant="quiet" size="sm" onClick={() => void leads.refetch()}>
            Retry
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title={scope === "mine" ? "No open leads for you" : "No leads here"}
          body={
            me.data?.workspace.slug
              ? `New leads appear here the moment they arrive. Try the public form at /f/${me.data.workspace.slug}.`
              : "New leads appear here the moment they arrive."
          }
        />
      ) : (
        <Table caption="Leads" columns={columns} rows={rows} rowKey={(l) => l.id} pageSize={15} />
      )}
    </>
  );
}

function InboxOverview({ leads, now }: { leads: Lead[] | undefined; now: number }) {
  const members = useMembers();
  const open = (leads ?? []).filter((l) => l.status !== "closed");
  const waiting = open.filter((l) => l.status === "assigned");
  const overdue = waiting.filter((l) => now > 0 && l.ackDeadline && new Date(l.ackDeadline).getTime() < now);
  const people = (members.data?.items ?? []).map((m) => ({
    id: m.userId,
    name: m.name,
    status: m.status,
    detail: `${presence[m.status].label} · ${m.openLeads} open`,
  }));
  const value = (n: number) => (leads ? n : "–");

  return (
    <div className="mb-8 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Waiting for acknowledgement" value={value(waiting.length)} icon={Clock} tint="violet" />
        <StatTile label="Past their window" value={value(overdue.length)} icon={AlarmClock} tint="pink" href="/recovery" />
        <StatTile label="Acknowledged" value={value(open.filter((l) => l.status === "acknowledged").length)} icon={CircleCheck} tint="green" />
        <StatTile label="No owner yet" value={value(open.filter((l) => l.status === "unassigned").length)} icon={UserX} tint="yellow" />
      </div>
      {people.length ? (
        <Card className="pb-4">
          <CardHeader title="On the desk" description="Only Available people receive new leads." />
          <div className="mt-3 px-5">
            <TeamStrip people={people} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function startOf(range: "today" | "week" | "month", now: number) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (range === "week") d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (range === "month") d.setDate(1);
  return d.getTime();
}
