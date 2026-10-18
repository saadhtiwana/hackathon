"use client";

import { useState } from "react";
import Link from "next/link";
import { useMe } from "@/components/session";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { can } from "@/lib/permissions";
import { useCrmMutations, useFields, usePipelines, type CustomField } from "./api";
import { Problem } from "./problem";

const types = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "dropdown", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
];

export function FieldSettings() {
  const me = useMe();
  const toast = useToast();
  const allowed = me.isSuccess && can(me.data, "settings.manage");
  const pipelines = usePipelines(allowed);
  const contactFields = useFields("contact", undefined, allowed);
  const opportunityFields = useFields("opportunity", undefined, allowed);
  const { createField, deleteField } = useCrmMutations();
  const [entity, setEntity] = useState<"contact" | "opportunity">("opportunity");
  const [pipelineId, setPipelineId] = useState("shared");
  const [name, setName] = useState("");
  const [type, setType] = useState<CustomField["type"]>("text");
  const [options, setOptions] = useState("");
  const pipelineOptions = [{ value: "shared", label: "Every pipeline" }, ...(pipelines.data?.items ?? []).map((item) => ({ value: item.id, label: item.name }))];

  if (me.isSuccess && !allowed) return <p className="text-[15px] text-text-muted">You need settings access to edit fields.</p>;

  const rows = [...(contactFields.data?.items ?? []), ...(opportunityFields.data?.items ?? [])];

  return (
    <div>
      <PageHeader
        title="Custom fields"
        description="Fields show on contact and opportunity forms as soon as you save them."
        actions={<Link href="/settings/pipelines" className="text-[14px] underline">Pipelines</Link>}
      />
      {contactFields.isError ? <Problem error={contactFields.error} onRetry={() => void contactFields.refetch()} /> : null}
      {opportunityFields.isError ? <Problem error={opportunityFields.error} onRetry={() => void opportunityFields.refetch()} /> : null}
      <ul className="mb-8 flex flex-col gap-2">
        {rows.map((field) => (
          <li key={field.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-[14px]">
            <span>{field.name} <span className="text-text-muted">{field.entity} · {field.type}{field.pipelineId ? "" : " · shared"}</span></span>
            <Button size="sm" variant="ghost" onClick={() => deleteField.mutate(field.id, { onSuccess: () => toast("Field removed", "ok") })}>Remove</Button>
          </li>
        ))}
        {contactFields.data && opportunityFields.data && rows.length === 0 ? <li className="text-[14px] text-text-muted">No custom fields yet.</li> : null}
      </ul>
      <form
        className="flex max-w-md flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = options.split(",").map((item) => item.trim()).filter(Boolean);
          if (!name.trim()) return;
          if (type === "dropdown" && parsed.length === 0) return;
          createField.mutate(
            {
              entity,
              pipelineId: entity === "opportunity" && pipelineId !== "shared" ? pipelineId : null,
              name: name.trim(),
              type,
              options: type === "dropdown" ? parsed : undefined,
            },
            {
              onSuccess: () => {
                setName("");
                setOptions("");
                toast("Field added. It is on the forms now.", "ok");
              },
            },
          );
        }}
      >
        <Field label="Name" htmlFor="field-name">
          <Input id="field-name" value={name} onChange={(event) => setName(event.target.value)} required />
        </Field>
        <Select label="Applies to" value={entity} onValueChange={(value) => setEntity(value as "contact" | "opportunity")} options={[{ value: "contact", label: "Contacts" }, { value: "opportunity", label: "Opportunities" }]} />
        {entity === "opportunity" && pipelineOptions.length > 0 ? (
          <Select label="Pipeline" value={pipelineOptions.some((item) => item.value === pipelineId) ? pipelineId : "shared"} onValueChange={setPipelineId} options={pipelineOptions} />
        ) : null}
        <Select label="Type" value={type} onValueChange={(value) => setType(value as CustomField["type"])} options={types} />
        {type === "dropdown" ? (
          <Field label="Options" htmlFor="field-options" hint="Separate choices with commas.">
            <Input id="field-options" value={options} onChange={(event) => setOptions(event.target.value)} />
          </Field>
        ) : null}
        {createField.isError ? <Problem error={createField.error} /> : null}
        {deleteField.isError ? <Problem error={deleteField.error} /> : null}
        <Button type="submit" className="self-start" disabled={createField.isPending}>{createField.isPending ? "Saving" : "Add field"}</Button>
      </form>
    </div>
  );
}
