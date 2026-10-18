"use client";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { CustomField } from "./api";

export function CustomInputs({
  fields,
  values,
  onChange,
}: {
  fields: CustomField[];
  values: Record<string, unknown>;
  onChange: (id: string, value: unknown) => void;
}) {
  if (fields.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {fields.map((field) => {
        const id = `field-${field.id}`;
        if (field.type === "checkbox") {
          return (
            <label key={field.id} className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" checked={values[field.id] === true} onChange={(event) => onChange(field.id, event.target.checked)} />
              {field.name}
            </label>
          );
        }
        if (field.type === "dropdown") {
          const options = (field.options ?? []).map((option) => ({ value: option, label: option }));
          const current = typeof values[field.id] === "string" ? (values[field.id] as string) : options[0]?.value;
          if (!current) return null;
          return (
            <Select key={field.id} label={field.name} value={current} onValueChange={(value) => onChange(field.id, value)} options={options} />
          );
        }
        return (
          <Field key={field.id} label={field.name} htmlFor={id}>
            <Input
              id={id}
              type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
              value={values[field.id] == null ? "" : String(values[field.id])}
              onChange={(event) => {
                const raw = event.target.value;
                onChange(field.id, field.type === "number" ? (raw === "" ? "" : Number(raw)) : raw);
              }}
            />
          </Field>
        );
      })}
    </div>
  );
}

export function packedCustom(fields: CustomField[], values: Record<string, unknown>) {
  const custom: Record<string, unknown> = {};
  for (const field of fields) {
    const value = values[field.id];
    if (value === "" || value == null) continue;
    custom[field.id] = value;
  }
  return custom;
}
