"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useMe } from "@/components/session";
import { Money } from "@/components/ui/money";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api/client";
import { can } from "@/lib/permissions";
import { Problem } from "./problem";

type Detail = {
  company: { id: string; name: string; domain: string | null; phone: string | null; address: string | null };
  contacts: { id: string; name: string; phone: string | null; email: string | null }[];
  opportunities: { id: string; name: string; contactName: string; stageName: string; valueCents?: number; currency?: string }[];
};

export function CompanyDetail() {
  const params = useParams<{ id: string }>();
  const me = useMe();
  const query = useQuery({
    queryKey: ["companies", "detail", params.id],
    queryFn: () => apiFetch<Detail>(`/companies/${params.id}`),
  });
  const hidden = !can(me.data, "crm.view_values");
  if (query.isLoading) return <Skeleton className="h-40 w-full" />;
  if (query.isError) return <Problem error={query.error} onRetry={() => void query.refetch()} />;
  const data = query.data;
  if (!data) return null;
  return (
    <div className="max-w-3xl">
      <Link href="/companies" className="text-[13px] text-text-muted hover:underline">Companies</Link>
      <h1 className="mt-2 text-[28px] leading-tight font-semibold tracking-tight sm:text-[32px]">{data.company.name}</h1>
      <p className="mt-2 text-[15px] text-text-muted">{[data.company.domain, data.company.phone, data.company.address].filter(Boolean).join(" · ") || "No details yet"}</p>
      <section className="mt-8">
        <h2 className="text-[18px] font-semibold">People</h2>
        <ul className="mt-2 flex flex-col gap-2">
          {data.contacts.map((person) => (
            <li key={person.id}>
              <Link href={`/contacts/${person.id}`} className="block rounded-lg border border-border px-3 py-2 text-[14px] hover:bg-surface-muted">
                {person.name}
                <span className="block text-[12px] text-text-muted">{[person.phone, person.email].filter(Boolean).join(" · ") || "No contact details"}</span>
              </Link>
            </li>
          ))}
          {data.contacts.length === 0 ? <li className="text-[14px] text-text-muted">No people attached.</li> : null}
        </ul>
      </section>
      <section className="mt-8">
        <h2 className="text-[18px] font-semibold">Opportunities</h2>
        <ul className="mt-2 flex flex-col gap-2">
          {data.opportunities.map((opp) => (
            <li key={opp.id}>
              <Link href={`/opportunities/${opp.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-[14px] hover:bg-surface-muted">
                <span>{opp.name}<span className="text-text-muted"> · {opp.contactName} · {opp.stageName}</span></span>
                <Money cents={opp.valueCents} currency={opp.currency} hidden={hidden || opp.valueCents == null} />
              </Link>
            </li>
          ))}
          {data.opportunities.length === 0 ? <li className="text-[14px] text-text-muted">None yet.</li> : null}
        </ul>
      </section>
    </div>
  );
}
