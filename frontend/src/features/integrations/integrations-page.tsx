"use client";

import { Suspense } from "react";
import { Plug } from "lucide-react";
import { useMe } from "@/components/session";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { can } from "@/lib/permissions";
import { useIntegrations } from "./api";
import { OAuthResult } from "./oauth-result";
import { MissingProviderCard, ProviderCard } from "./provider-card";
import { CalendarPeople, FailedAlerts, SyncHistory } from "./tables";

const order = [
  { id: "stripe", label: "Stripe (payments)" },
  { id: "email", label: "Email via Gmail (messaging)" },
  { id: "google_calendar", label: "Google Calendar (calendar)" },
  { id: "email_alerts", label: "Email alerts (notifications)" },
];

export function IntegrationsPage() {
  const me = useMe();
  const canManage = can(me.data, "integrations.manage");
  const canSee = canManage || can(me.data, "audit.view");
  const list = useIntegrations(me.isSuccess && canSee);
  const items = list.data?.items ?? [];

  return (
    <>
      <Breadcrumbs items={[{ href: "/dashboard", label: "Desk" }, { label: "Integrations" }]} />
      <PageHeader title="Integrations" description="Payments, email and calendars: what is connected, what it can do, and what went wrong." />
      <Suspense fallback={null}>
        <OAuthResult />
      </Suspense>
      {me.isSuccess && !canSee ? (
        <EmptyState icon={Plug} title="Admins only" body="You need Manage integrations or View the audit log to see this page." />
      ) : list.isLoading || me.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {order.map((o) => (
            <Skeleton key={o.id} className="h-64 w-full rounded-xl" />
          ))}
        </div>
      ) : list.isError ? (
        <div className="flex flex-col items-start gap-3">
          <Notice error={list.error} />
          <Button size="sm" variant="quiet" onClick={() => void list.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 lg:grid-cols-2">
            {order.map((o) => {
              const item = items.find((i) => i.provider === o.id);
              return item ? <ProviderCard key={o.id} item={item} canManage={canManage} /> : <MissingProviderCard key={o.id} label={o.label} />;
            })}
          </div>
          <CalendarPeople canManage={canManage} />
          <SyncHistory />
          {canManage ? <FailedAlerts /> : null}
        </div>
      )}
    </>
  );
}
