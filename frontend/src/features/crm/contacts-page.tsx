"use client";

import { useState } from "react";
import Link from "next/link";
import { useMe } from "@/components/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, type Column } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { can } from "@/lib/permissions";
import {
  downloadContacts,
  useCompanies,
  useContacts,
  useCrmMutations,
  useFields,
  usePeople,
  useTags,
  type Contact,
  type ContactFilters,
} from "./api";
import { CustomInputs, packedCustom } from "./custom-inputs";
import { Problem } from "./problem";

const sorts = [
  { value: "created_at", label: "Newest" },
  { value: "name", label: "Name" },
  { value: "email", label: "Email" },
];

export function ContactsPage() {
  const me = useMe();
  const toast = useToast();
  const ready = me.isSuccess;
  const [q, setQ] = useState("");
  const [ownerId, setOwnerId] = useState("all");
  const [companyId, setCompanyId] = useState("all");
  const [tagId, setTagId] = useState("all");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [sort, setSort] = useState("created_at");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [cursors, setCursors] = useState<string[]>([""]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", phone: "", email: "" });
  const [custom, setCustom] = useState<Record<string, unknown>>({});
  const [exportError, setExportError] = useState<unknown>(null);
  const filters: ContactFilters = {
    q: q.trim() || undefined,
    ownerId: ownerId === "all" ? undefined : ownerId,
    companyId: companyId === "all" ? undefined : companyId,
    tagId: tagId === "all" ? undefined : tagId,
    createdFrom: createdFrom || undefined,
    createdTo: createdTo || undefined,
    sort,
    dir,
    cursor: cursors[cursors.length - 1] || undefined,
  };
  const contacts = useContacts(filters, ready);
  const people = usePeople(ready);
  const companies = useCompanies("", ready);
  const tags = useTags(ready);
  const fields = useFields("contact", undefined, ready && open);
  const { createContact } = useCrmMutations();
  const ownerOptions = [{ value: "all", label: "Any owner" }, ...(people.data?.items ?? []).map((person) => ({ value: person.userId, label: person.name }))];
  const companyOptions = [{ value: "all", label: "Any company" }, ...(companies.data?.items ?? []).map((company) => ({ value: company.id, label: company.name }))];
  const tagOptions = [{ value: "all", label: "Any tag" }, ...(tags.data?.items ?? []).map((tag) => ({ value: tag.id, label: tag.name }))];

  function resetPage() {
    setCursors([""]);
  }

  const columns: Column<Contact>[] = [
    {
      key: "name",
      header: "Name",
      render: (row) => (
        <Link href={`/contacts/${row.id}`} className="font-medium hover:underline">
          {row.name}
        </Link>
      ),
    },
    { key: "company", header: "Company", render: (row) => row.companyName ?? "—" },
    { key: "phone", header: "Phone", render: (row) => row.phone ?? "—" },
    { key: "email", header: "Email", render: (row) => row.email ?? "—" },
    { key: "owner", header: "Owner", render: (row) => row.ownerName ?? "—" },
    { key: "status", header: "Status", render: (row) => (row.optedOut ? <Badge tone="signal">Opted out</Badge> : <Badge tone="ok">Active</Badge>) },
  ];

  return (
    <div>
      <PageHeader
        title="Contacts"
        description="People, their company, and who owns the relationship."
        actions={
          <div className="flex flex-wrap gap-2">
            {can(me.data, "crm.export") ? (
              <Button
                variant="quiet"
                onClick={() => {
                  setExportError(null);
                  void downloadContacts(filters)
                    .then(() => toast("Export downloaded", "ok"))
                    .catch((error: unknown) => setExportError(error));
                }}
              >
                Export CSV
              </Button>
            ) : null}
            {can(me.data, "crm.create") ? <Button onClick={() => setOpen(true)}>New contact</Button> : null}
          </div>
        }
      />
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Input
          aria-label="Search contacts"
          placeholder="Search name, phone, or email"
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            resetPage();
          }}
        />
        <Select label="Owner" value={ownerId} onValueChange={(value) => { setOwnerId(value); resetPage(); }} options={ownerOptions} />
        <Select label="Company" value={companyId} onValueChange={(value) => { setCompanyId(value); resetPage(); }} options={companyOptions} />
        <Select label="Tag" value={tagId} onValueChange={(value) => { setTagId(value); resetPage(); }} options={tagOptions} />
        <Field label="Created from" htmlFor="created-from">
          <Input id="created-from" type="date" value={createdFrom} onChange={(event) => { setCreatedFrom(event.target.value); resetPage(); }} />
        </Field>
        <Field label="Created to" htmlFor="created-to">
          <Input id="created-to" type="date" value={createdTo} onChange={(event) => { setCreatedTo(event.target.value); resetPage(); }} />
        </Field>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select label="Sort" value={sort} onValueChange={(value) => { setSort(value); resetPage(); }} options={sorts} />
        <Button variant="quiet" size="sm" aria-label={dir === "asc" ? "Sort ascending" : "Sort descending"} onClick={() => { setDir((value) => (value === "asc" ? "desc" : "asc")); resetPage(); }}>
          {dir === "asc" ? "Ascending" : "Descending"}
        </Button>
      </div>
      {exportError ? <Problem error={exportError} /> : null}
      {contacts.isLoading ? <Skeleton className="h-48 w-full" /> : null}
      {contacts.isError ? <Problem error={contacts.error} onRetry={() => void contacts.refetch()} /> : null}
      {contacts.data && contacts.data.items.length === 0 ? <EmptyState title="No contacts" body="Widen the filters, or add the first person." /> : null}
      {contacts.data && contacts.data.items.length > 0 ? (
        <div className="overflow-x-auto">
          <Table columns={columns} rows={contacts.data.items} rowKey={(row) => row.id} pageSize={50} caption="Contacts" />
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="quiet" size="sm" disabled={cursors.length < 2} onClick={() => setCursors((current) => current.slice(0, -1))}>
          Previous
        </Button>
        <Button
          variant="quiet"
          size="sm"
          disabled={!contacts.data?.nextCursor}
          onClick={() => {
            const next = contacts.data?.nextCursor;
            if (next) setCursors((current) => [...current, next]);
          }}
        >
          Next
        </Button>
        <span className="text-[13px] text-text-muted">{contacts.data?.total != null ? `${contacts.data.total} contacts` : null}</span>
      </div>

      <Dialog open={open} onOpenChange={setOpen} title="New contact" description="Phone is stored in international format.">
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            createContact.mutate(
              {
                name: draft.name.trim(),
                phone: draft.phone.trim() || undefined,
                email: draft.email.trim() || undefined,
                custom: packedCustom(fields.data?.items ?? [], custom),
              },
              {
                onSuccess: () => {
                  setOpen(false);
                  setDraft({ name: "", phone: "", email: "" });
                  setCustom({});
                  toast("Contact created", "ok");
                },
              },
            );
          }}
        >
          <Field label="Name" htmlFor="contact-name">
            <Input id="contact-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
          </Field>
          <Field label="Phone" htmlFor="contact-phone">
            <Input id="contact-phone" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} placeholder="+92..." />
          </Field>
          <Field label="Email" htmlFor="contact-email">
            <Input id="contact-email" type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
          </Field>
          <CustomInputs fields={fields.data?.items ?? []} values={custom} onChange={(id, value) => setCustom((current) => ({ ...current, [id]: value }))} />
          {createContact.isError ? <Problem error={createContact.error} /> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createContact.isPending}>{createContact.isPending ? "Saving" : "Create"}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
