"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { OP_LABEL, useListMutations, useResults } from "./api";
import { ResultsTable } from "./results-table";

export function ListView() {
  const params = useParams<{ id: string }>();
  // real id from the address bar (static pages can hand back a placeholder param)
  const id = decodeURIComponent((typeof window === "undefined" ? "" : window.location.pathname).split("/").filter(Boolean).pop() ?? params.id);
  const q = useResults(id);
  const { rename, remove } = useListMutations();
  const toast = useToast();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const list = q.data?.list;
  return (
    <>
      <Breadcrumbs items={[{ href: "/", label: "Desk" }, { href: "/lists", label: "Saved lists" }, { label: list?.name ?? "List" }]} />
      <PageHeader
        title={list?.name ?? "Saved list"}
        description={list ? `${q.data?.total ?? 0} ${list.entity} match right now. This updates by itself as records change.` : undefined}
        actions={
          list ? (
            <div className="flex gap-2">
              <Button variant="quiet" size="sm" onClick={() => { const n = window.prompt("Rename list", list.name)?.trim(); if (n && n !== list.name) rename.mutate({ id, name: n }, { onSuccess: () => toast("List renamed", "ok"), onError: (e) => toast(e.message, "signal") }); }}>
                <Pencil className="size-4" aria-hidden /> Rename
              </Button>
              <Button variant={confirm ? "signal" : "quiet"} size="sm" onClick={() => (confirm ? remove.mutate(id, { onSuccess: () => { toast("List deleted", "ok"); router.push("/lists"); }, onError: (e) => toast(e.message, "signal") }) : setConfirm(true))}>
                <Trash2 className="size-4" aria-hidden /> {confirm ? "Confirm delete" : "Delete"}
              </Button>
            </div>
          ) : null
        }
      />
      {list ? (
        <p className="mb-4 flex flex-wrap gap-2 text-[12px]">
          {list.criteria.map((c, i) => (
            <span key={i} className="rounded-full bg-surface-muted px-2.5 py-1">{c.field.startsWith("custom:") ? "custom field" : c.field} {OP_LABEL[c.op] ?? c.op} {String(c.value)}</span>
          ))}
        </p>
      ) : null}
      {q.isLoading ? <Skeleton className="h-40 w-full" /> : q.isError ? <Notice error={q.error} /> : list ? <ResultsTable entity={list.entity} rows={q.data!.items} /> : null}
    </>
  );
}
