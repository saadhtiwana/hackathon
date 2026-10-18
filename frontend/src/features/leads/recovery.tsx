"use client";

import Link from "next/link";
import { useMe } from "@/components/session";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, type Column } from "@/components/ui/table";
import { can } from "@/lib/permissions";
import { useMemberNames, useRecovery, type Lead, type RecoveryReason } from "./api";
import { LeadStatusPill, RecoveryReasonLine } from "./components/labels";
import { ReassignDialog } from "./components/reassign-dialog";
import { formatDuration, useServerNow } from "./time";

type Row = { lead: Lead; reasons: RecoveryReason[] };

export function RecoveryQueue() {
  const me = useMe();
  const allowed = can(me.data, "leads.reassign");
  const queue = useRecovery(me.isSuccess && allowed);
  const nameOf = useMemberNames();
  const now = useServerNow();

  const columns: Column<Row>[] = [
    {
      key: "contact",
      header: "Contact",
      sortValue: (r) => r.lead.contactName ?? "",
      render: (r) => (
        <span className="flex flex-col gap-0.5 py-1.5">
          <Link href={`/leads/${r.lead.id}`} className="font-medium hover:underline">
            {r.lead.contactName || "Unnamed contact"}
          </Link>
          <LeadStatusPill status={r.lead.status} />
        </span>
      ),
    },
    {
      key: "why",
      header: "Why it is here",
      render: (r) => (
        <ul className="flex flex-col gap-0.5 py-1.5">
          {r.reasons.map((x) => (
            <li key={x.code}>
              <RecoveryReasonLine code={x.code} text={x.text} />
            </li>
          ))}
        </ul>
      ),
    },
    {
      key: "owner",
      header: "Owner",
      sortValue: (r) => nameOf(r.lead.ownerId),
      render: (r) =>
        r.lead.ownerId ? (
          <span className="inline-flex items-center gap-2">
            <Avatar name={nameOf(r.lead.ownerId)} />
            {nameOf(r.lead.ownerId)}
            {r.lead.ownerAway ? <Badge tone="warn">Away</Badge> : null}
          </span>
        ) : (
          <span className="text-muted">Nobody</span>
        ),
    },
    {
      key: "age",
      header: "Age",
      align: "right",
      sortValue: (r) => new Date(r.lead.createdAt).getTime(),
      render: (r) => (
        <span className="font-mono tabular-nums">{now ? formatDuration((now - new Date(r.lead.createdAt).getTime()) / 1000) : "–"}</span>
      ),
    },
    {
      key: "action",
      header: "",
      align: "right",
      render: (r) => (
        <ReassignDialog
          lead={r.lead}
          trigger={
            <Button size="sm" variant="quiet">
              Reassign
            </Button>
          }
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Recovery queue" description="Leads that were ignored, escalated more than once, or left idle. Each row says why." />
      {me.isSuccess && !allowed ? (
        <EmptyState title="Managers only" body="You need the leads.reassign permission to see the recovery queue." />
      ) : queue.isLoading || me.isLoading ? (
        <div className="flex flex-col gap-2" aria-label="Loading recovery queue">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : queue.isError ? (
        <div className="flex flex-col items-start gap-3">
          <Notice error={queue.error} />
          <Button size="sm" variant="quiet" onClick={() => void queue.refetch()}>
            Retry
          </Button>
        </div>
      ) : !queue.data?.items.length ? (
        <EmptyState title="Nothing needs rescuing" body="Every open lead has an owner who is on it. Leads land here the moment they slip." />
      ) : (
        <Table caption="Recovery queue" columns={columns} rows={queue.data.items} rowKey={(r) => r.lead.id} pageSize={15} />
      )}
    </>
  );
}
