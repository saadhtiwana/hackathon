"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, Search, Settings2, SlidersHorizontal } from "lucide-react";
import "./dashboard.css";
import { useMe } from "@/components/session";
import { Avatar } from "@/components/ui/avatar";
import { DropdownItem, DropdownMenu } from "@/components/ui/dropdown-menu";
import { TeamStrip } from "@/components/ui/team-strip";
import { useServerNow } from "@/lib/clock";
import { can } from "@/lib/permissions";
import { usePrefs, useSavePrefs, useDashboard, WIDGETS, type Range } from "./api";
import { PipelineDonut, TrendChart } from "./components/charts";
import { CardState, DashCard, RoundButton, Segmented } from "./components/dash-card";
import { MyLeads } from "./components/my-leads";
import { PaymentsCard } from "./components/payments-card";
import { NeedsAttention, UpcomingAppointments } from "./components/right-rail";
import { StatRow } from "./components/stat-row";

const ranges: { value: Range; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
];

function greeting(now: number) {
  if (!now) return "Hello";
  const h = new Date(now).getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function DashboardPage() {
  const me = useMe();
  const router = useRouter();
  const now = useServerNow();
  const [range, setRange] = useState<Range>("today");
  const [q, setQ] = useState("");
  const dash = useDashboard(range, me.isSuccess);
  const prefs = usePrefs();
  const save = useSavePrefs();
  const hidden = new Set(prefs.data?.hidden ?? dash.data?.hidden ?? []);
  const show = (k: string) => !hidden.has(k);
  const d = dash.data;
  const first = me.data?.user.name.split(/\s+/)[0] ?? "";
  const currency = me.data?.workspace.defaultCurrency ?? "PKR";
  const team = (d?.availability.members ?? []).map((m) => ({ id: m.userId, name: m.name, status: m.status, detail: `${{ available: "Available", busy: "Busy", on_leave: "On leave", offline: "Offline" }[m.status]} · ${m.openLeads} open` }));

  function toggle(key: string) {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    save.mutate([...next]);
  }

  return (
    <div className="dash">
      <header className="mb-7 flex flex-col gap-5">
        <div className="grid items-center gap-3 lg:grid-cols-[1fr_auto_1fr]">
          <p className="text-[13px] text-text-muted">
            {d?.scope === "me" ? "Your desk" : "Company desk"} at {me.data?.workspace.name ?? "Relay"}
          </p>
          <div className="flex justify-start lg:justify-center">
            <Segmented label="Period" value={range} onChange={setRange} options={ranges} />
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <RoundButton label="Notifications" href="/settings/notifications">
              <Bell className="size-4" aria-hidden />
            </RoundButton>
            <RoundButton label="Assignment rules" href="/settings/assignment">
              <Settings2 className="size-4" aria-hidden />
            </RoundButton>
            <DropdownMenu
              label="Customize dashboard"
              trigger={
                <button type="button" className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-[var(--dash-card)] px-3 text-[13px] font-medium hover:bg-surface-hover">
                  <SlidersHorizontal className="size-4" aria-hidden />
                  Customize
                </button>
              }
            >
              <p className="px-2.5 pt-1.5 pb-1 text-[12px] text-text-muted">Show on my dashboard</p>
              {WIDGETS.map((w) => (
                <DropdownItem
                  key={w.key}
                  onSelect={(e) => {
                    e.preventDefault();
                    toggle(w.key);
                  }}
                  className="gap-2.5"
                >
                  <span className={`inline-flex size-4 items-center justify-center rounded-[5px] border ${show(w.key) ? "border-accent bg-accent text-on-accent" : "border-border-strong"}`} aria-hidden>
                    {show(w.key) ? <Check className="size-3" /> : null}
                  </span>
                  <span className="flex-1">{w.label}</span>
                  <span className="sr-only">{show(w.key) ? "shown" : "hidden"}</span>
                </DropdownItem>
              ))}
            </DropdownMenu>
            {me.data ? (
              <span className="hidden items-center gap-2.5 py-1 pr-2 pl-1 lg:inline-flex">
                <Avatar name={me.data.user.name} id={me.data.user.id} size="md" status={me.data.availability} />
                <span className="leading-tight">
                  <span className="block text-[13px] font-semibold">{me.data.user.name}</span>
                  <span className="block text-[11px] text-text-muted">{me.data.role.name}</span>
                </span>
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em] sm:text-[34px]">
            {greeting(now)}
            {first ? `, ${first}` : ""}
          </h1>
          <form
            role="search"
            className="flex h-10 w-full items-center gap-2.5 rounded-lg border border-transparent bg-surface-muted px-3.5 focus-within:border-border-strong focus-within:bg-surface lg:w-[340px]"
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim()) router.push(`/contacts?q=${encodeURIComponent(q.trim())}`);
            }}
          >
            <Search className="size-4 shrink-0 text-text-muted" aria-hidden />
            <label htmlFor="dash-search" className="sr-only">
              Search contacts
            </label>
            <input id="dash-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contacts, leads, people" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" />
          </form>
        </div>
      </header>

      {show("newLeadsToday") ? (
        <div className="mb-6">
          {dash.isError ? (
            <DashCard title="Figures">
              <CardState query={dash}>{null}</CardState>
            </DashCard>
          ) : (
            <StatRow data={d} range={range} loading={dash.isLoading} />
          )}
        </div>
      ) : null}

      {show("availability") ? (
        <DashCard title="On the desk" className="mb-6">
          <CardState query={dash} height="h-12">
            {team.length ? <TeamStrip people={team} /> : <p className="text-[13px] text-text-muted">Nobody on the team yet.</p>}
          </CardState>
        </DashCard>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-[240px_minmax(0,1fr)_280px]">
        {show("myLeads") ? (
          <div className="min-w-0 md:col-span-1">
            <MyLeads />
          </div>
        ) : null}

        <div className="flex min-w-0 flex-col gap-6 md:col-span-2 xl:col-span-1">
          {show("pipelineValue") || show("leadsTrend") ? (
            <div className="grid gap-6 lg:grid-cols-2">
              {show("pipelineValue") ? (
                <DashCard title="Pipeline by stage" href="/pipeline">
                  <CardState query={dash} height="h-56">
                    <PipelineDonut data={d?.pipelineValue ?? null} currency={currency} canValues={can(me.data, "crm.view_values")} />
                  </CardState>
                </DashCard>
              ) : null}
              {show("leadsTrend") ? (
                <DashCard title="Leads vs acknowledged" href="/leads">
                  <CardState query={dash} height="h-56">
                    {d?.trend ? <TrendChart trend={d.trend} /> : <p className="py-10 text-center text-[13px] text-text-muted">The trend appears once the server is updated.</p>}
                  </CardState>
                </DashCard>
              ) : null}
            </div>
          ) : null}
          {show("payments") ? <PaymentsCard range={range} /> : null}
        </div>

        <div className="flex min-w-0 flex-col gap-6 md:col-span-1 md:col-start-2 md:row-start-1 xl:col-start-auto xl:row-start-auto">
          {show("upcomingAppointments") ? <UpcomingAppointments data={d} query={dash} /> : null}
          {show("needsAttention") ? <NeedsAttention /> : null}
        </div>
      </div>
    </div>
  );
}
