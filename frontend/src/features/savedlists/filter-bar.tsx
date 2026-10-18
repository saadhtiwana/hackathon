"use client";

import { Plus, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { apiFetch } from "@/lib/api/client";
import { OP_LABEL, type Criterion, type Entity, type SchemaField } from "./api";

type Opt = { value: string; label: string };

// Combine up to 10 criteria (owner, tag, company, created date, custom fields...). Import it wherever a list needs filtering.
export function FilterBar({ entity, fields, value, onChange }: { entity: Entity; fields: SchemaField[]; value: Criterion[]; onChange: (c: Criterion[]) => void }) {
  const people = useQuery({ queryKey: ["availability"], queryFn: () => apiFetch<{ items: { userId: string; name: string }[] }>("/availability"), staleTime: 60_000 });
  const tags = useQuery({ queryKey: ["tags"], queryFn: () => apiFetch<{ items: { id: string; name: string }[] }>("/tags"), staleTime: 60_000 });
  const companies = useQuery({ queryKey: ["companies", "options"], queryFn: () => apiFetch<{ items: { id: string; name: string }[] }>("/companies?limit=200"), staleTime: 60_000 });
  const stages = useQuery({ queryKey: ["pipelines", "options"], queryFn: () => apiFetch<{ items: { id: string; name: string; stages: { id: string; name: string }[] }[] }>("/pipelines"), staleTime: 60_000 });

  const options = (f: SchemaField): Opt[] | null => {
    if (f.key === "owner") return [{ value: "none", label: "Unassigned" }, ...(people.data?.items ?? []).map((p) => ({ value: p.userId, label: p.name }))];
    if (f.key === "tag") return (tags.data?.items ?? []).map((t) => ({ value: t.id, label: t.name }));
    if (f.key === "company") return (companies.data?.items ?? []).map((c) => ({ value: c.id, label: c.name }));
    if (f.key === "stage") return (stages.data?.items ?? []).flatMap((p) => p.stages.map((s) => ({ value: s.id, label: `${p.name}: ${s.name}` })));
    if (f.key === "pipeline") return (stages.data?.items ?? []).map((p) => ({ value: p.id, label: p.name }));
    if (f.key === "opted_out") return [{ value: "true", label: "Yes" }, { value: "false", label: "No" }];
    if (f.options?.length) return f.options.map((o) => ({ value: o, label: o }));
    return null;
  };
  const set = (i: number, patch: Partial<Criterion>) => onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const add = () => {
    const f = fields[0];
    if (f) onChange([...value, { field: f.key, op: f.ops[0]!, value: "" }]);
  };

  return (
    <div className="flex flex-col gap-2" role="group" aria-label="Filters">
      {value.map((c, i) => {
        const f = fields.find((x) => x.key === c.field) ?? fields[0]!;
        const opts = options(f);
        const isDate = f.ops.includes("before");
        const isNum = f.type === "number" || f.key === "value";
        return (
          <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_130px_1.2fr_auto]">
            <Select label={`Field ${i + 1}`} value={c.field} onValueChange={(v) => { const nf = fields.find((x) => x.key === v)!; set(i, { field: v, op: nf.ops[0]!, value: "" }); }} options={fields.map((x) => ({ value: x.key, label: x.label }))} />
            <Select label={`Condition ${i + 1}`} value={c.op} onValueChange={(v) => set(i, { op: v })} options={f.ops.map((o) => ({ value: o, label: OP_LABEL[o] ?? o }))} />
            {opts ? (
              <Select label={`Value ${i + 1}`} value={String(c.value)} onValueChange={(v) => set(i, { value: v })} options={opts.length ? opts : [{ value: "", label: "No options" }]} placeholder="Choose" />
            ) : (
              <Input aria-label={`Value ${i + 1}`} type={isDate ? "date" : isNum ? "number" : "text"} value={String(c.value)} onChange={(e) => set(i, { value: isNum && e.target.value !== "" ? Number(e.target.value) : e.target.value })} />
            )}
            <Button variant="ghost" size="sm" aria-label={`Remove filter ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
              <X className="size-4" aria-hidden />
            </Button>
          </div>
        );
      })}
      <div>
        <Button variant="quiet" size="sm" onClick={add} disabled={value.length >= 10}>
          <Plus className="size-4" aria-hidden /> Add filter
        </Button>
      </div>
      <span className="sr-only">{entity}</span>
    </div>
  );
}
