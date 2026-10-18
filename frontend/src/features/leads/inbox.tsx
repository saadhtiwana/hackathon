"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { useMe } from "@/components/session";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, type Column } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { can } from "@/lib/permissions";
import { useAcknowledge, useLeads, useMemberNames, type Lead, type LeadStatus } from "./api";
import { DeadlineCountdown } from "./components/deadline-countdown";
import { LeadStatusPill, SourceLabel } from "./components/labels";
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
  const [status, setStatus] = useState<StatusFilter>("open");

  const serverStatus = status === "open" || status === "all" ? undefined : status;
  const leads = useLeads({ status: serverStatus, mine: scope === "mine" }, me.isSuccess);
  const rows = (leads.data?.items ?? []).filter((l) => status !== "open" || l.status !== "closed");

  const now = useServerNow();
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
          <span className={cn("-mx-1 inline-flex items-center gap-2 rounded-sm px-1 transition-colors duration-700", fresh && "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]")}>
            <Link href={`/leads/${l.id}`} className="font-medium hover:underline">
              {l.contactName || "Unnamed contact"}
            </Link>
            {fresh ? <Badge tone="neutral">New</Badge> : null}
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
      render: (l) =>
        l.ownerId ? (
          <span className="inline-flex items-center gap-2">
            <Avatar name={nameOf(l.ownerId)} />
            {l.ownerId === myId ? "You" : nameOf(l.ownerId)}
          </span>
        ) : (
          <span className="text-muted">Nobody</span>
        ),
    },
    {
      key: "deadline",
      header: "Time to ack",
      sortValue: (l) => (l.status === "assigned" && l.ackDeadline ? new Date(l.ackDeadline).getTime() : Number.MAX_SAFE_INTEGER),
      render: (l) =>
        l.status === "assigned" && l.ackDeadline ? (
          <DeadlineCountdown deadline={l.ackDeadline} startedAt={l.assignedAt} />
        ) : (
          <span className="text-muted">–</span>
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
              <div className="inline-flex rounded-md border border-line p-0.5" role="group" aria-label="Whose leads">
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
