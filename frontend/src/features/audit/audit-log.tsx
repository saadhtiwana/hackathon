"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { useMe } from "@/components/session";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, type Column } from "@/components/ui/table";
import { can } from "@/lib/permissions";
import { useAudit, useAuditFacets, type AuditEntry, type AuditFilters } from "./api";

const ALL = "all";

const text = (v: unknown): string => (v === null || v === undefined ? "none" : typeof v === "object" ? JSON.stringify(v) : String(v));

// Before and after side by side, one line per changed field.
function Diff({ before, after }: { before: unknown; after: unknown }) {
  const b = (before && typeof before === "object" ? before : {}) as Record<string, unknown>;
  const a = (after && typeof after === "object" ? after : {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  if (!keys.length) return <span className="text-text-muted">No values recorded</span>;
  return (
    <ul className="flex flex-col gap-0.5">
      {keys.slice(0, 6).map((k) => (
        <li key={k} className="flex flex-wrap items-center gap-1.5 text-[12px]">
          <span className="font-medium">{k}</span>
          {k in b ? <span className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-text-muted line-through decoration-text-muted/50">{text(b[k]).slice(0, 60)}</span> : null}
          {k in b && k in a ? <ArrowRight className="size-3 text-text-muted" aria-label="changed to" /> : null}
          {k in a ? <span className="rounded bg-tint-green px-1.5 py-0.5 font-mono text-tint-green-text">{text(a[k]).slice(0, 60)}</span> : null}
        </li>
      ))}
      {keys.length > 6 ? <li className="text-[12px] text-text-muted">and {keys.length - 6} more</li> : null}
    </ul>
  );
}

export function AuditLog() {
  const me = useMe();
  const allowed = can(me.data, "audit.view");
  const [action, setAction] = useState(ALL);
  const [actor, setActor] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const filters = useMemo<AuditFilters>(() => ({ action: action === ALL ? undefined : action, actorId: actor === ALL ? undefined : actor, from: from || undefined, to: to || undefined }), [action, actor, from, to]);
  const facets = useAuditFacets(allowed);
  const q = useAudit(filters, allowed);
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];

  const columns: Column<AuditEntry>[] = [
    { key: "time", header: "Time", sortValue: (r) => r.createdAt, render: (r) => <span className="font-mono text-[12px] tabular-nums">{format(new Date(r.createdAt), "d MMM yyyy, HH:mm:ss")}</span> },
    { key: "actor", header: "Actor", render: (r) => (r.actor ? (r.actor.name ?? "Unknown user") : <Badge>System</Badge>) },
    { key: "action", header: "Action", sortValue: (r) => r.action, render: (r) => <span className="font-mono text-[12px]">{r.action}</span> },
    { key: "target", header: "Target", render: (r) => <span className="text-[12px]">{r.targetType}{r.targetId ? <span className="ml-1 font-mono text-text-muted">{r.targetId.slice(0, 8)}</span> : null}</span> },
    { key: "change", header: "Before → after", render: (r) => <Diff before={r.before} after={r.after} /> },
  ];

  if (me.isSuccess && !allowed) {
    return (
      <>
        <Breadcrumbs items={[{ href: "/", label: "Desk" }, { label: "Audit log" }]} />
        <PageHeader title="Audit log" description="Who changed what, and what it was before." />
        <EmptyState icon={ShieldAlert} title="You do not have access" body="Viewing the audit log needs the audit permission. Ask an admin to grant it." />
      </>
    );
  }

  return (
    <>
      <Breadcrumbs items={[{ href: "/", label: "Desk" }, { label: "Audit log" }]} />
      <PageHeader title="Audit log" description="Who changed what, and what it was before. Entries are read-only and cannot be edited or deleted." />
      <form className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => e.preventDefault()} aria-label="Filter the audit log">
        <Field label="Event type" htmlFor="audit-action">
          <Select
            label="Event type"
            value={action}
            onValueChange={setAction}
            options={[{ value: ALL, label: "All events" }, ...(facets.data?.actions ?? []).map((a) => ({ value: a, label: a })), ...(facets.data?.actions.length ? [] : [])]}
          />
        </Field>
        <Field label="Actor" htmlFor="audit-actor">
          <Select
            label="Actor"
            value={actor}
            onValueChange={setActor}
            options={[{ value: ALL, label: "Anyone" }, { value: "system", label: "System" }, ...(facets.data?.actors ?? []).map((a) => ({ value: a.id, label: a.name }))]}
          />
        </Field>
        <Field label="From" htmlFor="audit-from">
          <Input id="audit-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To" htmlFor="audit-to">
          <Input id="audit-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </form>
      {q.isLoading || me.isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : q.isError ? (
        <div className="flex flex-col items-start gap-2">
          <Notice error={q.error} />
          <Button size="sm" variant="quiet" onClick={() => void q.refetch()}>
            Retry
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="No entries match" body="Try a wider date range or a different event type." />
      ) : (
        <>
          <p className="mb-2 text-[12px] text-text-muted tabular-nums" aria-live="polite">
            Showing {rows.length} of {q.data?.pages[0]?.total ?? rows.length}
          </p>
          <Table columns={columns} rows={rows} rowKey={(r) => r.id} pageSize={25} caption="Audit log entries" />
          {q.hasNextPage ? (
            <div className="mt-3">
              <Button variant="quiet" onClick={() => void q.fetchNextPage()} disabled={q.isFetchingNextPage}>
                {q.isFetchingNextPage ? "Loading more" : "Load older entries"}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
