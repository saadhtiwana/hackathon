"use client";

import { useState } from "react";
import Link from "next/link";
import { useMe } from "@/components/session";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, type Column } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { can } from "@/lib/permissions";
import { useCompanies, useCrmMutations, type Company } from "./api";
import { Problem } from "./problem";

export function CompaniesPage() {
  const me = useMe();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", domain: "" });
  const companies = useCompanies(q, me.isSuccess);
  const { createCompany } = useCrmMutations();
  const columns: Column<Company>[] = [
    {
      key: "name",
      header: "Name",
      sortValue: (row) => row.name,
      render: (row) => (
        <Link href={`/companies/${row.id}`} className="font-medium hover:underline">
          {row.name}
        </Link>
      ),
    },
    { key: "domain", header: "Domain", render: (row) => row.domain ?? "—" },
    { key: "phone", header: "Phone", render: (row) => row.phone ?? "—" },
  ];

  return (
    <div>
      <PageHeader
        title="Companies"
        description="The organisations your contacts belong to."
        actions={can(me.data, "crm.create") ? <Button onClick={() => setOpen(true)}>New company</Button> : null}
      />
      <Input
        aria-label="Search companies"
        placeholder="Search name or domain"
        value={q}
        onChange={(event) => setQ(event.target.value)}
        className="mb-4 sm:max-w-xs"
      />
      {companies.isLoading ? <Skeleton className="h-40 w-full" /> : null}
      {companies.isError ? <Problem error={companies.error} onRetry={() => void companies.refetch()} /> : null}
      {companies.data && companies.data.items.length === 0 ? <EmptyState title="No companies" body="Add the organisation, then attach people to it." /> : null}
      {companies.data && companies.data.items.length > 0 ? (
        <div className="overflow-x-auto">
          <Table columns={columns} rows={companies.data.items} rowKey={(row) => row.id} pageSize={50} caption="Companies" />
        </div>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen} title="New company">
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            createCompany.mutate(
              { name: draft.name.trim(), domain: draft.domain.trim() || undefined },
              {
                onSuccess: () => {
                  setOpen(false);
                  setDraft({ name: "", domain: "" });
                  toast("Company created", "ok");
                },
              },
            );
          }}
        >
          <Field label="Name" htmlFor="company-name">
            <Input id="company-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
          </Field>
          <Field label="Domain" htmlFor="company-domain">
            <Input id="company-domain" value={draft.domain} onChange={(event) => setDraft({ ...draft, domain: event.target.value })} placeholder="example.com" />
          </Field>
          {createCompany.isError ? <Problem error={createCompany.error} /> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createCompany.isPending}>{createCompany.isPending ? "Saving" : "Create"}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
