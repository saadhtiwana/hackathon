"use client";

import Link from "next/link";
import { format } from "date-fns";
import { formatMoney } from "@/lib/format";
import type { Entity, Row } from "./api";

// Plain scrollable table: records are links, money is hidden when the API omits it.
export function ResultsTable({ entity, rows }: { entity: Entity; rows: Row[] }) {
  const cols = entity === "contacts" ? ["Name", "Email", "Phone", "Company", "Owner", "Created"] : ["Name", "Stage", "Contact", "Owner", "Value", "Created"];
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
        <caption className="sr-only">Matching {entity}</caption>
        <thead>
          <tr className="h-10 border-b border-border text-[12px] text-text-muted">
            {cols.map((c) => (
              <th key={c} scope="col" className="px-4 font-medium whitespace-nowrap">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r.id)} className="h-11 border-b border-border last:border-b-0 hover:bg-surface-hover">
              {entity === "contacts" ? (
                <>
                  <td className="px-4"><Link className="font-medium underline" href={`/contacts/${r.id}`}>{r.name}</Link></td>
                  <td className="px-4">{r.email ?? "-"}</td>
                  <td className="px-4 tabular-nums">{r.phone ?? "-"}</td>
                  <td className="px-4">{r.companyName ?? "-"}</td>
                  <td className="px-4">{r.ownerName ?? "Unassigned"}</td>
                  <td className="px-4 tabular-nums">{format(new Date(String(r.createdAt)), "d MMM yyyy")}</td>
                </>
              ) : (
                <>
                  <td className="px-4"><Link className="font-medium underline" href={`/opportunities/${r.id}`}>{r.name}</Link></td>
                  <td className="px-4">{r.stageName}</td>
                  <td className="px-4"><Link className="underline" href={`/contacts/${r.contactId}`}>{r.contactName}</Link></td>
                  <td className="px-4">{r.ownerName ?? "Unassigned"}</td>
                  <td className="px-4 font-mono tabular-nums">{r.valueCents == null ? "hidden" : formatMoney(Number(r.valueCents), String(r.currency ?? "PKR"))}</td>
                  <td className="px-4 tabular-nums">{format(new Date(String(r.createdAt)), "d MMM yyyy")}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
