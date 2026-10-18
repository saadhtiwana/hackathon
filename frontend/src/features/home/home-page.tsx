"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Calendar, Clock, Inbox, LifeBuoy, Mail, Wallet } from "lucide-react";
import { RelayMark } from "@/components/brand/relay-mark";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import { cn } from "@/lib/cn";

const WINDOW = 4 * 60 + 12;

function useLeadClock() {
  const [left, setLeft] = useState(WINDOW);
  const [moved, setMoved] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return;
    let remaining = WINDOW;
    let hold = 0;
    const id = window.setInterval(() => {
      if (remaining > 0) {
        remaining -= 1;
        hold = 0;
        setMoved(false);
        setLeft(remaining);
        return;
      }
      hold += 1;
      setMoved(true);
      setLeft(0);
      if (hold >= 3) {
        remaining = WINDOW;
        hold = 0;
        setMoved(false);
        setLeft(WINDOW);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return { left, moved, ratio: left / WINDOW };
}

function clock(total: number) {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function Glass({
  className,
  delay = "0s",
  children,
}: {
  className?: string;
  delay?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn("home-float rounded-2xl border border-border bg-surface p-3.5 text-text shadow-raised", className)}
      style={{ animationDelay: delay }}
    >
      {children}
    </div>
  );
}

export function HomePage() {
  const { left, moved, ratio } = useLeadClock();
  const owner = moved ? "Ahmad" : "Hira";
  const time = clock(left);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1120px] items-center gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="Relay" className="flex h-9 items-center gap-2.5 rounded-md px-1 text-[16px] font-semibold tracking-tight hover:bg-surface-hover">
            <RelayMark size={30} />
            Relay
          </Link>
          <nav aria-label="Page" className="ml-4 hidden items-center gap-6 text-[14px] text-text-muted md:flex">
            <a href="#desk" className="hover:text-text">
              The desk
            </a>
            <a href="#how" className="hover:text-text">
              How it works
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <Link href="/login" className="inline-flex h-10 items-center rounded-full px-3 text-[14px] font-medium text-text-muted hover:bg-surface-hover hover:text-text">
              Log in
            </Link>
            <Link href="/signup" className="inline-flex h-10 items-center rounded-full bg-text px-4 text-[14px] font-medium text-canvas hover:opacity-90">
              Create a workspace
            </Link>
          </div>
        </div>
      </header>

      <section className="relative mx-3 mt-3 overflow-hidden rounded-[28px] border border-border bg-[#f4f1ea] sm:mx-4 lg:mx-6" aria-labelledby="home-title">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,253,248,0.95),transparent_58%)]" />
        <div className="relative z-10 mx-auto max-w-[760px] px-5 pt-16 text-center sm:pt-20">
          <p className="text-[13px] font-medium tracking-wide text-text-muted">For teams who answer customers</p>
          <h1 id="home-title" className="mt-4 text-[clamp(40px,6.4vw,76px)] leading-[1.02] font-semibold tracking-[-0.04em]">
            Every lead has one owner
          </h1>
          <p className="mx-auto mt-5 max-w-[520px] text-[16px] leading-relaxed text-text-muted sm:text-[18px]">
            A clock starts when the lead arrives. If nobody answers, Relay moves it and emails the next person.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup" className="inline-flex h-11 items-center rounded-full bg-text px-5 text-[14px] font-medium text-canvas hover:opacity-90">
              Create a workspace
            </Link>
            <a href="#desk" className="inline-flex h-11 items-center rounded-full border border-border-strong bg-surface px-5 text-[14px] font-medium text-text hover:bg-surface-hover">
              See the desk
            </a>
          </div>
        </div>

        <div className="relative z-10 mx-auto mt-12 w-full max-w-[440px] px-4">
          <LeadCard time={time} owner={owner} moved={moved} ratio={ratio} />
        </div>

        <Glass className="absolute top-[42%] left-[4%] z-20 hidden w-[240px] xl:block" delay="-1.2s">
          <div className="flex items-center gap-3">
            <Avatar name="Ayesha Khan" id="ayesha-khan" size={40} />
            <span>
              <span className="block text-[13px] font-medium">Ayesha Khan</span>
              <span className="block text-[12px] text-text-muted">Emailed the agency</span>
            </span>
          </div>
          <p className="mt-3 text-[13px] leading-snug">Looking at the F-7 plot this week.</p>
        </Glass>

        <Glass className="absolute top-[38%] right-[4%] z-20 hidden w-[220px] xl:block" delay="-3s">
          <div className="flex items-center gap-2 text-[12px] font-medium text-text-muted">
            <Mail className="size-3.5" aria-hidden />
            Just arrived
          </div>
          <p className="mt-2 text-[15px] font-semibold tracking-tight">New lead, source Email</p>
          <p className="mt-1 text-[12px] text-text-muted">Matched to Ayesha, assigned to {owner}.</p>
        </Glass>

        <Glass className="absolute bottom-[12%] left-[6%] z-20 hidden w-[230px] xl:block" delay="-4.5s">
          <div className="flex items-center gap-3">
            <Avatar name={owner} id={owner.toLowerCase()} size={36} status={moved ? "busy" : "available"} />
            <span>
              <span className="block text-[13px] font-medium">{moved ? "Passed to Ahmad" : "Hira owns this"}</span>
              <span className="block text-[12px] text-text-muted">{moved ? "Hira did not answer" : "Available · one open lead"}</span>
            </span>
          </div>
        </Glass>

        <Glass className="absolute right-[5%] bottom-[14%] z-20 hidden w-[230px] xl:block" delay="-2.2s">
          <div className="flex items-center gap-2 text-[12px] font-medium text-tint-green-text">
            <Calendar className="size-3.5" aria-hidden />
            Visit held
          </div>
          <p className="mt-2 text-[15px] font-semibold tracking-tight">Thursday, 4:30pm</p>
          <p className="mt-1 text-[12px] text-text-muted">On Hira’s calendar. No double booking.</p>
        </Glass>

        <ul className="relative z-10 mx-auto mt-4 grid max-w-[440px] grid-cols-1 gap-3 px-4 pb-8 sm:grid-cols-2 xl:hidden">
          <li className="rounded-2xl border border-border bg-surface p-3.5 text-text shadow-raised">
            <div className="flex items-center gap-2.5">
              <Avatar name="Ayesha Khan" id="ayesha-khan" size={32} />
              <span className="text-[13px] font-medium">Ayesha emailed</span>
            </div>
          </li>
          <li className="rounded-2xl border border-border bg-surface p-3.5 text-text shadow-raised">
            <div className="flex items-center gap-2.5">
              <Avatar name={owner} id={owner.toLowerCase()} size={32} status={moved ? "busy" : "available"} />
              <span className="text-[13px] font-medium">{moved ? "Passed to Ahmad" : "Hira owns it"}</span>
            </div>
          </li>
        </ul>

        <div className="relative z-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-5 pt-2 pb-8 text-[13px] text-text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Mail className="size-3.5" aria-hidden /> Gmail
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="size-3.5" aria-hidden /> Google Calendar
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Wallet className="size-3.5" aria-hidden /> Stripe
          </span>
        </div>
      </section>

      <section id="desk" className="scroll-mt-20 px-3 py-16 sm:px-4 lg:px-6 lg:py-24">
        <div className="mx-auto max-w-[680px] text-center">
          <h2 className="text-[clamp(32px,4vw,48px)] leading-[1.08] font-semibold tracking-[-0.035em]">If nobody answers, it moves.</h2>
          <p className="mt-4 text-[16px] leading-relaxed text-text-muted">
            The same desk your team already uses. One owner, the time left, and the reason a lead changed hands.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-[1080px] rounded-[28px] border border-border bg-[#f4f1ea] px-3 py-8 sm:px-6 sm:py-10 lg:px-10">
          <DeskPreview time={time} owner={owner} moved={moved} />
        </div>
      </section>

      <section className="mx-auto grid max-w-[1080px] items-center gap-8 px-4 pb-8 sm:px-6 lg:grid-cols-2 lg:gap-14 lg:pb-16">
        <div className="relative aspect-[4/3] overflow-hidden rounded-[28px]">
          <Image src="/home/record-still.jpg" alt="A cream envelope and a brass key on a pale wooden table in morning light" fill className="object-cover" sizes="(min-width: 1024px) 50vw, 100vw" />
        </div>
        <div>
          <h2 className="text-[clamp(28px,3vw,40px)] leading-[1.12] font-semibold tracking-[-0.035em]">The record stays in one place.</h2>
          <p className="mt-4 text-[16px] leading-relaxed text-text-muted">
            The email that opened the lead, the person who owns it, the visit on their calendar, and the payment link all sit on the same contact. Nobody goes hunting through another tool.
          </p>
        </div>
      </section>

      <section id="how" className="scroll-mt-20 mx-auto max-w-[1080px] px-4 py-16 sm:px-6 lg:py-24">
        <h2 className="text-[clamp(28px,3vw,40px)] font-semibold tracking-[-0.035em]">How a lead moves</h2>
        <ol className="mt-10 grid gap-px overflow-hidden rounded-[20px] border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <li key={step.title} className="bg-surface p-6">
              <span className="text-[12px] font-medium text-accent-text tabular-nums">0{index + 1}</span>
              <h3 className="mt-3 text-[16px] font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto grid max-w-[1080px] gap-4 px-4 pb-20 sm:px-6 lg:grid-cols-5 lg:pb-28">
        <div className="flex min-h-[320px] items-end rounded-[28px] border border-border bg-[#f4f1ea] p-8 lg:col-span-2">
          <p className="text-[26px] leading-[1.2] font-semibold tracking-[-0.03em]">
            One owner.
            <br />
            One clock.
            <br />
            Then it moves.
          </p>
        </div>
        <ul className="grid gap-4 lg:col-span-3">
          {moments.map((item) => (
            <li key={item.title} className="flex items-center gap-4 rounded-[20px] border border-border bg-surface p-4 shadow-raised">
              <Avatar name={item.who} id={item.who} size={44} status={item.status} />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium">{item.title}</span>
                <span className="block text-[13px] text-text-muted">{item.body}</span>
              </span>
              <Badge tone={item.tone}>{item.badge}</Badge>
            </li>
          ))}
        </ul>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="flex items-center gap-2.5 text-[14px] font-semibold">
            <RelayMark size={28} />
            Relay
          </p>
          <p className="text-[13px] text-text-muted">Every inbound lead has one accountable owner.</p>
          <div className="flex gap-4 text-[13px]">
            <Link href="/login" className="text-text-muted hover:text-text">
              Log in
            </Link>
            <Link href="/signup" className="font-medium text-accent-text hover:underline">
              Create a workspace
            </Link>
          </div>
        </div>
      </footer>
    </>
  );
}

function LeadCard({ time, owner, moved, ratio }: { time: string; owner: string; moved: boolean; ratio: number }) {
  return (
    <div className="rounded-[24px] bg-surface p-5 text-left text-text shadow-raised sm:p-6">
      <div className="flex items-center gap-3">
        <Avatar name="Ayesha Khan" id="ayesha-khan" size={44} />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold">Ayesha Khan</span>
          <span className="block text-[13px] text-text-muted">Plot enquiry · Email</span>
        </span>
        <Badge tone={moved ? "signal" : "warn"} className="ml-auto">
          {moved ? "Escalated" : "Waiting"}
        </Badge>
      </div>
      <p className="mt-5 text-[14px] leading-relaxed text-text-muted">“Looking at the F-7 plot this week. Can someone call me back?”</p>
      <div className="mt-5 flex items-end justify-between gap-4">
        <div>
          <p className={cn("text-[56px] leading-none font-semibold tracking-[-0.04em] tabular-nums", moved ? "text-danger" : "text-accent-text")} aria-hidden>
            {time}
          </p>
          <p className="mt-2 text-[13px] text-text-muted">{moved ? "Window ended. Moving the lead." : "left to acknowledge"}</p>
        </div>
        <span className="mb-1 inline-flex items-center gap-2 text-[13px] font-medium">
          <Avatar name={owner} id={owner.toLowerCase()} size={28} status={moved ? "busy" : "available"} />
          {owner}
        </span>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
        <div className={cn("h-full rounded-full", moved ? "bg-danger" : "bg-accent")} style={{ width: `${Math.max(ratio * 100, moved ? 0 : 4)}%` }} />
      </div>
      <p className="sr-only" aria-live="polite">
        {moved ? `Acknowledgement window ended. Lead passed to ${owner}.` : "Ayesha Khan is waiting to be acknowledged."}
      </p>
    </div>
  );
}

function DeskPreview({ time, owner, moved }: { time: string; owner: string; moved: boolean }) {
  return (
    <div className="rounded-[20px] border border-border bg-canvas p-3 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3 px-1">
        <p className="text-[14px] font-semibold">Leads</p>
        <p className="text-[12px] text-text-muted">Sample desk · the first clock is live</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="New today" value="12" icon={Inbox} tint="violet" />
        <StatTile label="Waiting" value={moved ? "2" : "3"} icon={Clock} tint="yellow" />
        <StatTile label="Recovery" value="1" icon={LifeBuoy} tint="pink" />
        <StatTile label="Collected" value="4" icon={Wallet} tint="green" hint="this month" />
      </div>
      <ul className="mt-3 overflow-hidden rounded-xl border border-border bg-surface">
        <li className={cn("flex flex-wrap items-center gap-3 px-4 py-3.5 transition-colors", moved && "bg-tint-yellow")}>
          <Avatar name="Ayesha Khan" id="ayesha-khan" size={36} />
          <span className="min-w-[140px] flex-1">
            <span className="block text-[14px] font-medium">Ayesha Khan</span>
            <span className="block text-[12px] text-text-muted">Plot enquiry · Email</span>
          </span>
          <span className="inline-flex items-center gap-2 text-[13px]">
            <Avatar name={owner} id={owner.toLowerCase()} size={24} status={moved ? "busy" : "available"} />
            {owner}
          </span>
          <span className={cn("ml-auto text-[14px] font-semibold tabular-nums", moved ? "text-danger" : "text-accent-text")}>{moved ? "Moved" : time}</span>
        </li>
        <li className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3.5">
          <Avatar name="Bilal Raza" id="bilal-raza" size={36} />
          <span className="min-w-[140px] flex-1">
            <span className="block text-[14px] font-medium">Bilal Raza</span>
            <span className="block text-[12px] text-text-muted">Site visit · Form</span>
          </span>
          <span className="inline-flex items-center gap-2 text-[13px]">
            <Avatar name="Ahmad" id="ahmad" size={24} status="available" />
            Ahmad
          </span>
          <Badge tone="ok" className="ml-auto">
            Acknowledged
          </Badge>
        </li>
        <li className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3.5">
          <Avatar name="Noor Ahmed" id="noor-ahmed" size={36} />
          <span className="min-w-[140px] flex-1">
            <span className="block text-[14px] font-medium">Noor Ahmed</span>
            <span className="block text-[12px] text-text-muted">Payment link · Email</span>
          </span>
          <span className="inline-flex items-center gap-2 text-[13px]">
            <Avatar name="Sana" id="sana" size={24} status="busy" />
            Sana
          </span>
          <Badge tone="accent" className="ml-auto">
            Link sent
          </Badge>
        </li>
      </ul>
    </div>
  );
}

const steps = [
  { title: "It arrives", body: "A customer emails the agency address, or fills the public form. An unknown sender becomes a contact and a lead." },
  { title: "One owner", body: "Assignment gives it to one available person. Two people never own it at the same time." },
  { title: "The clock", body: "The time left to acknowledge is on the lead. The owner can see it. So can everyone else." },
  { title: "It moves", body: "If the window ends, the lead goes to the next person and they get an email with the reason." },
];

const moments: { who: string; title: string; body: string; badge: string; tone: "ok" | "accent" | "warn"; status: "available" | "busy" }[] = [
  { who: "Hira", title: "Hira acknowledged Ayesha", body: "The clock stopped. The lead stays with her.", badge: "Acknowledged", tone: "ok", status: "available" },
  { who: "Ahmad", title: "Thursday 4:30 is on Ahmad’s calendar", body: "Busy times are checked before the visit is booked.", badge: "Booked", tone: "accent", status: "busy" },
  { who: "Sana", title: "Sana sent Noor a payment link", body: "The link goes out by email. Card numbers stay with Stripe.", badge: "Link sent", tone: "warn", status: "available" },
];
