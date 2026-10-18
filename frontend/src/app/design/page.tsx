"use client";

import { useState } from "react";
import {
  Building2,
  Calendar,
  ChevronDown,
  Clock,
  Filter,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  MessageSquare,
  Plus,
  Search,
  SlidersHorizontal,
  User,
  Users,
  Wallet,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Countdown } from "@/components/ui/countdown";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";

type Lead = {
  id: string;
  name: string;
  place: string;
  source: string;
  owner: string;
  seconds: number;
  value: string;
};

const leads: Lead[] = [
  { id: "hira", name: "Hira Qureshi", place: "F-7, Islamabad", source: "WhatsApp", owner: "Ahmad Mustafa", seconds: 154, value: "Rs 18,500,000" },
  { id: "omar", name: "Omar Siddiqui", place: "DHA Phase 2", source: "Web form", owner: "Abdullah Khan", seconds: 42, value: "Rs 42,000,000" },
  { id: "sara", name: "Sara Malik", place: "Bahria Town", source: "Manual", owner: "Ahmad Mustafa", seconds: -24, value: "Rs 9,750,000" },
  { id: "bilal", name: "Bilal Khan", place: "E-11", source: "WhatsApp", owner: "Saad Tiwana", seconds: 210, value: "Rs 27,000,000" },
  { id: "ayesha", name: "Ayesha Farooq", place: "G-13", source: "Web form", owner: "Abdullah Khan", seconds: 96, value: "Rs 12,400,000" },
  { id: "usman", name: "Usman Raza", place: "F-10", source: "WhatsApp", owner: "Saad Tiwana", seconds: 180, value: "Rs 33,200,000" },
];

const nav = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Leads", icon: Inbox, count: 6 },
  { label: "Inbox", icon: MessageSquare },
  { label: "Contacts", icon: Users },
  { label: "Companies", icon: Building2 },
  { label: "Recovery queue", icon: LifeBuoy },
  { label: "Appointments", icon: Calendar },
  { label: "Payments", icon: Wallet },
];

function Header({ children, icon: Icon }: { children: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <th className="h-9 px-3 text-left text-[12px] font-medium whitespace-nowrap text-muted">
      <span className="inline-flex items-center gap-1.5">
        <Icon className="size-3.5" />
        {children}
      </span>
    </th>
  );
}

function Frame({ night }: { night: boolean }) {
  const [checked, setChecked] = useState<string[]>(["hira"]);
  const [message, setMessage] = useState(
    "Hi Hira, thanks for reaching out about the F-7 plot. I can show it to you today or tomorrow. Which works better?",
  );

  function toggle(id: string) {
    setChecked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <div className={cn("flex min-h-screen bg-surface text-ink", night ? "dark" : "light")}>
      <aside className="hidden w-[232px] shrink-0 flex-col border-r border-line bg-wash px-3 py-3 md:flex">
        <button
          type="button"
          className="flex h-8 items-center gap-2 rounded-md px-1.5 text-[13px] font-medium hover:bg-line/50"
        >
          <span className="flex size-5 items-center justify-center rounded-md bg-accent text-[11px] font-semibold text-on-accent">
            M
          </span>
          Margalla Estates
          <ChevronDown className="ml-auto size-3.5 text-muted" />
        </button>

        <button
          type="button"
          className="mt-3 flex h-8 items-center gap-2 rounded-md border border-line bg-surface px-2 text-[13px] text-muted"
        >
          <Search className="size-3.5" />
          Search
          <span className="ml-auto">
            <Kbd>Ctrl K</Kbd>
          </span>
        </button>

        <nav className="mt-4 flex flex-col gap-0.5" aria-label="Preview">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = item.label === "Leads";
            return (
              <div
                key={item.label}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-md px-2 text-[13px]",
                  active ? "bg-surface font-medium text-ink shadow-[0_1px_2px_rgba(16,24,40,0.08)]" : "text-muted",
                )}
              >
                <Icon className="size-4" />
                <span className="flex-1">{item.label}</span>
                {item.count ? <Badge tone="signal">{item.count}</Badge> : null}
              </div>
            );
          })}
        </nav>
      </aside>

      <section className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center gap-2 border-b border-line px-5">
          <Inbox className="size-4 text-muted" />
          <h1 className="text-[14px] font-medium">Leads</h1>
          <span className="ml-auto flex items-center gap-2">
            <Badge tone="ok">Available</Badge>
            <Avatar name="Ahmad Mustafa" size={24} />
          </span>
        </header>

        <div className="flex h-12 items-center gap-2 border-b border-line px-5">
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium hover:bg-wash"
          >
            <Inbox className="size-3.5 text-muted" />
            All leads
            <ChevronDown className="size-3.5 text-muted" />
          </button>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] text-muted hover:bg-wash"
          >
            <Filter className="size-3.5" />
            Filter
          </button>
          <span className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-[13px] hover:bg-wash"
            >
              <SlidersHorizontal className="size-3.5" />
              View settings
            </button>
            <Button>
              <Plus className="size-3.5" />
              New lead
            </Button>
          </span>
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="border-b border-line bg-surface">
                <th className="w-10 pl-5">
                  <span className="block size-4 rounded-[4px] border border-line" />
                </th>
                <Header icon={User}>Lead</Header>
                <Header icon={MessageSquare}>Source</Header>
                <Header icon={Users}>Owner</Header>
                <Header icon={Clock}>Time to acknowledge</Header>
                <Header icon={Wallet}>Value</Header>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const on = checked.includes(lead.id);
                return (
                  <tr
                    key={lead.id}
                    onClick={() => toggle(lead.id)}
                    className={cn("h-11 cursor-pointer border-b border-line", on ? "bg-wash" : "hover:bg-wash")}
                  >
                    <td className="pl-5">
                      <span
                        className={cn(
                          "flex size-4 items-center justify-center rounded-[4px] border",
                          on ? "border-accent bg-accent text-on-accent" : "border-line bg-surface",
                        )}
                      >
                        {on ? (
                          <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M2.5 6.5l2.5 2.5 4.5-5" />
                          </svg>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-3">
                      <span className="flex items-center gap-2.5">
                        <Avatar name={lead.name} size={24} />
                        <span>
                          <span className="block text-[13px] leading-4 font-medium">{lead.name}</span>
                          <span className="block text-[12px] leading-4 text-muted">{lead.place}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 text-[13px] text-muted">{lead.source}</td>
                    <td className="px-3">
                      <span className="inline-flex items-center gap-2 text-[13px]">
                        <Avatar name={lead.owner} />
                        {lead.owner}
                      </span>
                    </td>
                    <td className="px-3">
                      <Countdown seconds={lead.seconds} windowSeconds={180} />
                    </td>
                    <td className="px-3 text-[13px] tabular-nums">{lead.value}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="pointer-events-none absolute right-6 bottom-6 w-[360px] max-w-[calc(100%-48px)]">
          <div className="pointer-events-auto rounded-lg border border-line bg-surface p-4 shadow-float">
            <p className="text-[12px] text-muted">First reply</p>
            <h2 className="mt-0.5 text-[16px] font-medium">Reply to Hira Qureshi</h2>
            <p className="mt-1 text-[12px] text-muted">
              Replying counts as acknowledging the lead and stops the timer.
            </p>
            <div className="mt-3 flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-[13px]">
              <span className="text-muted">To</span>
              <Avatar name="Hira Qureshi" />
              Hira Qureshi
              <span className="ml-auto text-[12px] text-muted">WhatsApp</span>
            </div>
            <Textarea
              className="mt-2 min-h-24 text-[13px]"
              aria-label="Message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
            <div className="mt-3 flex items-center gap-2">
              <Button>Send message</Button>
              <Button variant="ghost">Discard</Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function DesignPage() {
  const [night, setNight] = useState(false);

  return (
    <main id="content" className="min-h-full">
      <div className={cn("fixed top-3 right-3 z-30 flex h-8 rounded-md border border-line bg-surface p-0.5 shadow-float", night && "dark")}>
        <button
          type="button"
          onClick={() => setNight(false)}
          className={cn("h-7 rounded-sm px-3 text-[12px] font-medium", !night ? "bg-wash" : "text-muted")}
        >
          Day
        </button>
        <button
          type="button"
          onClick={() => setNight(true)}
          className={cn("h-7 rounded-sm px-3 text-[12px] font-medium", night ? "bg-wash" : "text-muted")}
        >
          Night
        </button>
      </div>
      <Frame night={night} />
    </main>
  );
}
