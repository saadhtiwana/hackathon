"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useListMutations, usePreview, useSavedLists, useSchema, type Criterion, type Entity } from "./api";
import { FilterBar } from "./filter-bar";
import { ResultsTable } from "./results-table";

export function ListsPage() {
  const [entity, setEntity] = useState<Entity>("contacts");
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const schema = useSchema();
  const saved = useSavedLists();
  const { create } = useListMutations();
  const toast = useToast();
  const router = useRouter();
  const ready = criteria.length > 0 && criteria.every((c) => String(c.value) !== "");
  const preview = usePreview(entity, criteria, ready);
  const fields = schema.data?.[entity] ?? [];

  return (
    <>
      <PageHeader title="Saved lists" description="Combine filters, save the result, and the list keeps itself up to date as records start or stop matching." />
      <div className="mb-4 flex gap-2" role="group" aria-label="What to filter">
        {(["contacts", "opportunities"] as const).map((e) => (
          <Button key={e} size="sm" variant={entity === e ? "dark" : "quiet"} aria-pressed={entity === e} onClick={() => { setEntity(e); setCriteria([]); }}>
            {e === "contacts" ? "Contacts" : "Opportunities"}
          </Button>
        ))}
      </div>
      <Card className="mb-4 p-4">
        {schema.isLoading ? <Skeleton className="h-10 w-full" /> : <FilterBar entity={entity} fields={fields} value={criteria} onChange={setCriteria} />}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="text-[13px] text-text-muted tabular-nums" aria-live="polite">
            {!ready ? "Add at least one filter and fill in its value." : preview.isFetching ? "Checking…" : `${preview.data?.total ?? 0} match${preview.data?.total === 1 ? "" : "es"}`}
          </p>
          <Dialog open={open} onOpenChange={setOpen} title="Save as list" description="Name it so you can find it again." trigger={<Button size="sm" disabled={!ready}><Save className="size-4" aria-hidden /> Save as list</Button>}>
            <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate({ name: name.trim(), entity, criteria }, { onSuccess: (r) => { toast("List saved", "ok"); setOpen(false); setName(""); router.push(`/lists/${r.list.id}`); } }); }}>
              <Field label="List name" htmlFor="list-name"><Input id="list-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} /></Field>
              <Notice error={create.error} />
              <Button type="submit" disabled={create.isPending}>{create.isPending ? "Saving" : "Save list"}</Button>
            </form>
          </Dialog>
        </div>
        {preview.isError ? <div className="mt-2"><Notice error={preview.error} /></div> : null}
      </Card>
      {ready && preview.data ? <div className="mb-8"><ResultsTable entity={entity} rows={preview.data.items} /></div> : null}

      <h2 className="mb-2 text-[16px] font-semibold">Your lists</h2>
      {saved.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : saved.data?.items.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {saved.data.items.map((l) => (
            <li key={l.id}>
              <Link href={`/lists/${l.id}`} className="block rounded-xl border border-border bg-surface p-3 hover:border-border-strong">
                <span className="block text-[14px] font-medium">{l.name}</span>
                <span className="block text-[12px] text-text-muted">{l.entity} · {l.criteria.length} filter{l.criteria.length === 1 ? "" : "s"}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No saved lists yet" body="Build a filter above and press Save as list." />
      )}
    </>
  );
}
