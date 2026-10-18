"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useMe } from "@/components/session";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api/client";
import { can } from "@/lib/permissions";
import { useCrmMutations, useFields, usePeople, type Activity, type CustomField, type Opportunity } from "./api";
import { ActivityTimeline } from "./activity-timeline";
import { CustomInputs, packedCustom } from "./custom-inputs";
import { Problem } from "./problem";
import { ContactPayments, type SlotPayment } from "./slots";

type Detail = {
  opportunity: Opportunity & { custom?: Record<string, unknown> };
  contact: { id: string; name: string } | null;
  stage: { id: string; name: string } | null;
  pipeline: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
  payments: SlotPayment[];
  activities: Activity[];
};

function OpportunityForm({
  data,
  fields,
  owners,
  seeValues,
}: {
  data: Detail;
  fields: CustomField[];
  owners: { value: string; label: string }[];
  seeValues: boolean;
}) {
  const toast = useToast();
  const { updateOpportunity, addNote } = useCrmMutations();
  const [name, setName] = useState(data.opportunity.name);
  const [value, setValue] = useState(data.opportunity.valueCents != null ? String(data.opportunity.valueCents / 100) : "");
  const [ownerId, setOwnerId] = useState(data.opportunity.ownerId ?? owners[0]?.value ?? "");
  const [ownerTouched, setOwnerTouched] = useState(false);
  const [custom, setCustom] = useState<Record<string, unknown>>(data.opportunity.custom ?? {});
  const [note, setNote] = useState("");

  return (
    <>
      <form
        className="mt-6 flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = Number(value);
          const cents = !seeValues || value.trim() === "" || !Number.isFinite(parsed) ? undefined : Math.round(parsed * 100);
          updateOpportunity.mutate(
            {
              id: data.opportunity.id,
              version: data.opportunity.version,
              name: name.trim(),
              valueCents: seeValues ? cents : undefined,
              ownerId: ownerTouched ? ownerId || null : undefined,
              custom: packedCustom(fields, custom),
            },
            { onSuccess: () => toast("Saved", "ok") },
          );
        }}
      >
        <Field label="Name" htmlFor="opp-name">
          <Input id="opp-name" value={name} onChange={(event) => setName(event.target.value)} required />
        </Field>
        <Field label="Stage" htmlFor="opp-stage">
          <Input id="opp-stage" value={data.stage?.name ?? ""} readOnly />
        </Field>
        {seeValues ? (
          <Field label="Value" htmlFor="opp-value" hint="Amount in the pipeline currency.">
            <Input id="opp-value" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} />
          </Field>
        ) : (
          <p className="text-[14px] text-text-muted">Value •••• hidden</p>
        )}
        {owners.length > 0 && ownerId ? (
          <Select label="Owner" value={ownerId} onValueChange={(next) => { setOwnerTouched(true); setOwnerId(next); }} options={owners} />
        ) : (
          <p className="text-[14px] text-text-muted">No one is assigned yet.</p>
        )}
        <CustomInputs fields={fields} values={custom} onChange={(id, next) => setCustom((current) => ({ ...current, [id]: next }))} />
        {updateOpportunity.isError ? <Problem error={updateOpportunity.error} /> : null}
        <Button type="submit" className="self-start" disabled={updateOpportunity.isPending}>{updateOpportunity.isPending ? "Saving" : "Save"}</Button>
      </form>
      <section className="mt-8">
        <h2 className="text-[18px] font-semibold">Activity</h2>
        <div className="mt-3"><ActivityTimeline items={data.activities} /></div>
        <form
          className="mt-4 flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!note.trim()) return;
            addNote.mutate(
              { opportunityId: data.opportunity.id, contactId: data.contact?.id, body: note.trim() },
              { onSuccess: () => { setNote(""); toast("Note added", "ok"); } },
            );
          }}
        >
          <label htmlFor="opp-note" className="text-[13px] font-medium">Add note</label>
          <Textarea id="opp-note" value={note} onChange={(event) => setNote(event.target.value)} />
          {addNote.isError ? <Problem error={addNote.error} /> : null}
          <Button type="submit" className="self-start" disabled={addNote.isPending}>{addNote.isPending ? "Saving" : "Add note"}</Button>
        </form>
      </section>
    </>
  );
}

export function OpportunityDetail() {
  const params = useParams<{ id: string }>();
  const me = useMe();
  const query = useQuery({
    queryKey: ["opportunities", "detail", params.id],
    queryFn: () => apiFetch<Detail>(`/opportunities/${params.id}`),
  });
  const fields = useFields("opportunity", query.data?.pipeline?.id, query.isSuccess);
  const people = usePeople(me.isSuccess);
  const seeValues = can(me.data, "crm.view_values");
  const canEdit = can(me.data, "crm.edit");

  if (query.isLoading) return <Skeleton className="h-48 w-full" />;
  if (query.isError) return <Problem error={query.error} onRetry={() => void query.refetch()} />;
  const data = query.data;
  if (!data) return null;
  const owners = (people.data?.items ?? []).map((person) => ({ value: person.userId, label: person.name }));

  return (
    <div className="max-w-3xl">
      <Link href="/pipeline" className="text-[13px] text-text-muted hover:underline">Pipeline</Link>
      <h1 className="mt-2 text-[28px] leading-tight font-semibold tracking-tight sm:text-[32px]">{data.opportunity.name}</h1>
      <p className="mt-2 text-[15px] text-text-muted">
        {[data.pipeline?.name, data.stage?.name, data.contact?.name, data.owner?.name].filter(Boolean).join(" · ")}
      </p>
      <section className="mt-8">
        <h2 className="text-[18px] font-semibold">Payments</h2>
        <div className="mt-2"><ContactPayments items={data.payments} hidden={!seeValues} /></div>
      </section>
      {canEdit ? (
        <OpportunityForm
          key={`${data.opportunity.id}-${data.opportunity.version}`}
          data={data}
          fields={fields.data?.items ?? []}
          owners={owners}
          seeValues={seeValues}
        />
      ) : (
        <section className="mt-8">
          <h2 className="text-[18px] font-semibold">Activity</h2>
          <div className="mt-3"><ActivityTimeline items={data.activities} /></div>
        </section>
      )}
    </div>
  );
}
