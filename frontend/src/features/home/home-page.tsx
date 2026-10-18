"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BellRing, CalendarCheck, CircleCheck, CreditCard, Inbox, LayoutDashboard, Mail, Repeat2, ScrollText, ShieldCheck, UserCheck, Users } from "lucide-react";
import { RelayMark } from "@/components/brand/relay-mark";
import { useMe } from "@/components/session";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import "./home.css";

// Fade-and-rise when a block scrolls into view. One observer for the page.
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(".home [data-reveal]");
    if (!("IntersectionObserver" in window)) {
      els.forEach((e) => e.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io.unobserve(e.target))),
      { threshold: 0.15, rootMargin: "0px 0px -6% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
}

const PEOPLE = [
  { id: "p1", name: "Ahmad Mustafa", role: "Next available" },
  { id: "p2", name: "Abdullah Khan", role: "Backup" },
  { id: "p3", name: "Saad Hayat", role: "Manager" },
];
const WINDOW = 9; // demo seconds per level; real windows are whatever you configure

// The idea in one loop: a lead sits with exactly one person, the clock runs, and if nobody acts it is passed on, then stops at the last level.
function HandoffDemo() {
  const [level, setLevel] = useState(0);
  const [left, setLeft] = useState(WINDOW);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    let l = 0;
    let t = WINDOW;
    let hold = 0;
    const id = window.setInterval(() => {
      if (hold > 0) {
        hold -= 1;
        if (hold === 0) {
          l = 0;
          t = WINDOW;
          setDone(false);
          setLevel(0);
          setLeft(WINDOW);
        }
        return;
      }
      t -= 1;
      if (t > 0) return void setLeft(t);
      if (l < 2) {
        l += 1;
        t = WINDOW;
        setLevel(l);
        setLeft(WINDOW);
      } else {
        setLeft(0);
        setDone(true);
        hold = 4;
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const C = 2 * Math.PI * 22;
  const pos = ["8%", "50%", "92%"][level];
  return (
    <div className="float relative mx-auto w-full max-w-[520px] rounded-2xl border border-border bg-surface p-5 shadow-[0_30px_80px_-30px_rgba(23,20,15,0.25)] sm:p-6" aria-label="Animated example: a lead is handed to the next person when nobody acknowledges it">
      <div className="flex items-center justify-between text-[12px] text-text-muted">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 font-medium text-text">
          <Mail className="size-3.5" aria-hidden /> New lead · Email
        </span>
        <span className="tabular-nums">just now</span>
      </div>
      <h3 className="mt-4 text-[20px] leading-tight font-semibold tracking-[-0.01em]">Property enquiry</h3>
      <p className="mt-1 text-[14px] text-text-muted">Interested in a 10 Marla house in DHA Phase 2, budget 3.5 crore.</p>

      <div className="mt-5 flex items-center justify-between gap-4 rounded-xl bg-surface-muted p-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={PEOPLE[level]!.name} id={PEOPLE[level]!.id} size="lg" />
          <div className="min-w-0">
            <p className="text-[12px] text-text-muted">Owner right now</p>
            <p className="truncate text-[15px] font-semibold">{PEOPLE[level]!.name}</p>
          </div>
        </div>
        <div className="relative size-14 shrink-0" role="timer" aria-label={`${left} seconds left to acknowledge`}>
          <svg viewBox="0 0 52 52" className="size-14 -rotate-90">
            <circle cx="26" cy="26" r="22" fill="none" stroke="var(--border-strong)" strokeWidth="3" />
            <circle className="ring" cx="26" cy="26" r="22" fill="none" stroke={done ? "var(--text-muted)" : "var(--logo-b)"} strokeWidth="3" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - left / WINDOW)} />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center font-mono text-[12px] font-semibold tabular-nums">{`0:${String(left).padStart(2, "0")}`}</span>
        </div>
      </div>

      <div className="relative mt-6 pb-2">
        <div className="absolute top-[22px] right-[8%] left-[8%] h-px bg-border-strong" aria-hidden />
        <span className="baton absolute top-[18px] z-10 h-[9px] w-7 -translate-x-1/2 rounded-full bg-[var(--logo-b)]" style={{ left: pos }} aria-hidden />
        <ol className="relative grid grid-cols-3">
          {PEOPLE.map((p, i) => (
            <li key={p.id} className="flex flex-col items-center gap-2 text-center">
              <span className={cn("node flex size-11 items-center justify-center rounded-full border bg-surface", i === level ? "border-text" : i < level ? "border-border bg-surface-muted opacity-60" : "border-border")}>
                <Avatar name={p.name} id={p.id} size="md" />
              </span>
              <span className="text-[12px] leading-tight">
                <span className={cn("block font-medium", i === level ? "text-text" : "text-text-muted")}>{p.name.split(" ")[0]}</span>
                <span className="block text-[11px] text-text-muted">{p.role}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      <p className="mt-3 text-center text-[12px] text-text-muted" aria-live="polite">
        {done ? "End of the chain: it stays with the manager, nothing is lost." : level === 0 ? "One owner. The clock is running." : "Not acknowledged in time, so it moved on."}
      </p>
    </div>
  );
}

function Section({ id, eyebrow, title, children, className }: { id?: string; eyebrow: string; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("mx-auto w-full max-w-[1120px] scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28", className)}>
      <p data-reveal className="text-[13px] font-medium text-text-muted">{eyebrow}</p>
      <h2 data-reveal style={{ "--d": "0.05s" } as React.CSSProperties} className="mt-3 max-w-[22ch] text-[clamp(30px,4.4vw,48px)] leading-[1.08] font-semibold tracking-[-0.03em]">{title}</h2>
      <div className="mt-12">{children}</div>
    </section>
  );
}

const STEPS = [
  { n: "01", title: "A lead arrives", body: "From your web form, a customer email to your agency address, or typed in by hand. Each one carries its source." },
  { n: "02", title: "One person owns it", body: "Round-robin among people who are Available and under their limit. On leave, busy or offline means no leads, and you see why." },
  { n: "03", title: "A visible clock starts", body: "The owner gets an email and a countdown on screen. Acknowledging, or doing anything on the lead, stops it." },
  { n: "04", title: "Nobody answers? It moves", body: "Next available person, then a backup, then a manager, with the time you set for each level. It stops at the last level and never goes ownerless." },
];

const FEATURES = [
  { icon: Users, title: "Exactly one owner", body: "Two people can never own the same lead, and two timers can never escalate it twice." },
  { icon: BellRing, title: "Alerts that land", body: "Escalations arrive as real email with a link straight to the lead, plus an in-app bell." },
  { icon: Inbox, title: "A real inbox", body: "Customer email becomes a conversation. Reply from Relay and it leaves in the same thread." },
  { icon: CreditCard, title: "Get paid", body: "Create a Stripe checkout link from the contact, email it, and watch the status flip to Paid on its own." },
  { icon: CalendarCheck, title: "Book on real calendars", body: "See busy times, avoid clashes, and the customer gets a Google Calendar invite." },
  { icon: ScrollText, title: "A trail nobody can edit", body: "Who did what, when, with before and after values. The database itself refuses edits and deletes." },
  { icon: ShieldCheck, title: "Roles you control", body: "Hide deal values from people who should not see them, enforced on the server, not just in the screen." },
  { icon: LayoutDashboard, title: "Numbers that match", body: "Every figure on the dashboard opens the exact records it counted." },
];


function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_24px_60px_-30px_rgba(23,20,15,0.25)]">
      <div className="flex items-center gap-2 border-b border-border bg-surface-muted/60 px-4 py-2.5 text-[12px] text-text-muted">
        <span className="font-medium text-text">{title}</span>
        <span className="ml-auto font-mono">margalla-estates</span>
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </div>
  );
}

const TOUR = [
  {
    key: "leads",
    label: "Leads",
    text: "Every lead shows its owner and the time left to acknowledge. Anything late is flagged in plain words.",
    view: (
      <Frame title="Leads">
        <ul className="divide-y divide-border text-[14px]">
          {[
            ["Rare Gaming Legacy", "Email", "Ahmad Mustafa", "0:21", "Waiting for ack"],
            ["Nida Siddiqui", "Web form", "Abdullah Khan", "Acknowledged", "First response 0:34"],
            ["Imran Raza", "Manual", "Saad Hayat", "Acknowledged", "First response 1:02"],
          ].map(([n, src, o, t, sub]) => (
            <li key={n} className="grid grid-cols-[1fr_auto] items-center gap-3 py-3 sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
              <span className="min-w-0"><span className="block truncate font-medium">{n}</span><span className="block text-[12px] text-text-muted">{src}</span></span>
              <span className="hidden text-text-muted sm:block">{o}</span>
              <span className="text-right font-mono text-[13px] tabular-nums sm:text-left">{t}</span>
              <span className="hidden text-[12px] text-text-muted sm:block">{sub}</span>
            </li>
          ))}
        </ul>
      </Frame>
    ),
  },
  {
    key: "inbox",
    label: "Inbox",
    text: "Customer email arrives as a conversation. Reply here and it goes out in the same thread.",
    view: (
      <Frame title="Inbox">
        <div className="flex flex-col gap-3 text-[14px]">
          <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-surface-muted px-4 py-3">Interested in a 10 Marla house in DHA Phase 2, budget 3.5 crore.<span className="mt-1 block text-[11px] text-text-muted">Rare Gaming Legacy · 10:12</span></div>
          <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-text px-4 py-3 text-canvas">Thanks for writing. We have a few options in range. Can we arrange a visit tomorrow?<span className="mt-1 block text-[11px] text-canvas/60">You · sent 10:14</span></div>
          <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-surface-muted px-4 py-3">Tomorrow 12pm works.<span className="mt-1 block text-[11px] text-text-muted">Rare Gaming Legacy · 10:18</span></div>
        </div>
      </Frame>
    ),
  },
  {
    key: "payments",
    label: "Payments",
    text: "Send a checkout link from the contact. It flips to Paid on its own, and collected money is kept apart from expected money.",
    view: (
      <Frame title="Payments">
        <div className="grid grid-cols-2 divide-x divide-border rounded-xl border border-border">
          <div className="p-4"><p className="text-[12px] text-text-muted">Collected</p><p className="mt-1 text-[26px] font-semibold tracking-[-0.02em] tabular-nums">Rs 25,000</p></div>
          <div className="p-4"><p className="text-[12px] text-text-muted">Awaiting payment</p><p className="mt-1 text-[26px] font-semibold tracking-[-0.02em] tabular-nums">Rs 0</p></div>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-xl bg-surface-muted px-4 py-3 text-[14px]">
          <span><span className="block font-medium">Rare Gaming Legacy</span><span className="block text-[12px] text-text-muted">Booking token</span></span>
          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium"><CircleCheck className="size-4" aria-hidden /> Paid</span>
        </div>
      </Frame>
    ),
  },
] as const;

function ProductTour() {
  const [tab, setTab] = useState<(typeof TOUR)[number]["key"]>("leads");
  const cur = TOUR.find((t) => t.key === tab)!;
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[0.8fr_1.2fr]">
      <div data-reveal>
        <div role="tablist" aria-label="Product tour" className="inline-flex rounded-lg bg-surface-muted p-0.5">
          {TOUR.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={cn("h-9 rounded-md px-4 text-[13px] font-medium", tab === t.key ? "bg-surface text-text shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-text-muted hover:text-text")}>
              {t.label}
            </button>
          ))}
        </div>
        <p className="mt-5 max-w-[38ch] text-[16px] leading-relaxed text-text-muted">{cur.text}</p>
      </div>
      <div data-reveal style={{ "--d": "0.08s" } as React.CSSProperties} key={tab} className="animate-fade-in">{cur.view}</div>
    </div>
  );
}

const TIMELINE: [string, string, string, typeof Mail][] = [
  ["Email received", "Property enquiry from Rare Gaming Legacy", "10:12", Mail],
  ["Assigned to Ahmad Mustafa", "Round-robin, countdown started", "10:12", UserCheck],
  ["Escalated to Abdullah Khan", "Level 1, window expired", "10:12", Repeat2],
  ["Acknowledged by Abdullah Khan", "First response 0:28", "10:13", CircleCheck],
  ["Visit booked", "Tomorrow 12:00, customer invited", "10:20", CalendarCheck],
  ["Payment received", "Rs 25,000, confirmed by Stripe", "10:41", CreditCard],
];

function Wordmark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <RelayMark size={size} />
      <span className="text-[19px] leading-none font-semibold tracking-[-0.02em] lowercase">relay</span>
    </span>
  );
}

export function HomePage() {
  useReveal();
  const me = useMe();
  const signedIn = me.isSuccess;

  return (
    <div className="home bg-canvas text-text">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-canvas/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[1120px] items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label="Relay home"><Wordmark size={26} /></Link>
          <nav aria-label="Main" className="hidden items-center gap-7 text-[14px] text-text-muted md:flex">
            <a href="#how" className="hover:text-text">How it works</a>
            <a href="#features" className="hover:text-text">Features</a>
            <a href="#tour" className="hover:text-text">Product</a>
            <a href="#record" className="hover:text-text">One record</a>
          </nav>
          <div className="flex items-center gap-2">
            {signedIn ? (
              <Link href="/dashboard" className="inline-flex h-9 items-center rounded-lg bg-text px-3.5 text-[13px] font-medium text-canvas hover:opacity-90">Open dashboard</Link>
            ) : (
              <>
                <Link href="/login" className="hidden h-9 items-center rounded-lg px-3 text-[13px] font-medium text-text-muted hover:text-text sm:inline-flex">Sign in</Link>
                <Link href="/signup" className="inline-flex h-9 items-center rounded-lg bg-text px-3.5 text-[13px] font-medium text-canvas hover:opacity-90">Get started</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <div className="mx-auto grid w-full max-w-[1120px] items-center gap-14 px-5 pt-16 pb-12 sm:px-8 sm:pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:pb-24">
          <div>
            <h1 data-reveal style={{ "--d": "0.06s" } as React.CSSProperties} className="text-[clamp(40px,7vw,76px)] leading-[1.02] font-semibold tracking-[-0.04em]">
              Every lead has
              <br />
              exactly one owner.
            </h1>
            <p data-reveal style={{ "--d": "0.12s" } as React.CSSProperties} className="mt-6 max-w-[46ch] text-[clamp(16px,1.6vw,19px)] leading-relaxed text-text-muted">
              Relay hands each inbound lead to one accountable person, starts a countdown everyone can see, and passes it on automatically when it is dropped. Nothing goes quiet.
            </p>
            <div data-reveal style={{ "--d": "0.18s" } as React.CSSProperties} className="mt-9 flex flex-wrap items-center gap-3">
              <Link href={signedIn ? "/dashboard" : "/signup"} className="group inline-flex h-12 items-center gap-2 rounded-xl bg-text px-6 text-[15px] font-medium text-canvas hover:opacity-90">
                {signedIn ? "Open your dashboard" : "Create your workspace"}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
              {signedIn ? null : (
                <Link href="/login" className="inline-flex h-12 items-center rounded-xl border border-border bg-surface px-5 text-[15px] font-medium hover:bg-surface-hover">Sign in</Link>
              )}
            </div>
            <p data-reveal style={{ "--d": "0.24s" } as React.CSSProperties} className="mt-5 text-[13px] text-text-muted">Works with Gmail, Stripe and Google Calendar.</p>
          </div>
          <div data-reveal style={{ "--d": "0.15s" } as React.CSSProperties}>
            <HandoffDemo />
          </div>
        </div>

        <div className="border-y border-border bg-surface-muted/50">
          <div className="mx-auto grid w-full max-w-[1120px] gap-px px-5 py-10 text-center sm:grid-cols-3 sm:px-8">
            {[
              ["1", "accountable owner at any moment"],
              ["3", "levels of escalation, each with its own timer"],
              ["0", "leads left without a person"],
            ].map(([n, l], i) => (
              <div key={n} data-reveal style={{ "--d": `${i * 0.08}s` } as React.CSSProperties} className="py-4">
                <p className="text-[clamp(40px,5vw,60px)] leading-none font-semibold tracking-[-0.04em] tabular-nums">{n}</p>
                <p className="mx-auto mt-2 max-w-[24ch] text-[14px] text-text-muted">{l}</p>
              </div>
            ))}
          </div>
        </div>

        <Section id="how" eyebrow="How it works" title="From first message to a handled lead">
          <ol className="grid gap-x-10 gap-y-12 md:grid-cols-2">
            {STEPS.map((s, i) => (
              <li key={s.n} data-reveal style={{ "--d": `${(i % 2) * 0.08}s` } as React.CSSProperties} className="border-t border-border pt-5">
                <span className="font-mono text-[13px] text-text-muted">{s.n}</span>
                <h3 className="mt-2 text-[20px] font-semibold tracking-[-0.015em]">{s.title}</h3>
                <p className="mt-2 max-w-[44ch] text-[15px] leading-relaxed text-text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="features" eyebrow="Everything in one place" title="The tools around the lead, already connected" className="pt-8 sm:pt-12">
          <ul className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f, i) => (
              <li key={f.title} data-reveal style={{ "--d": `${(i % 4) * 0.05}s` } as React.CSSProperties} className="group bg-surface p-6 hover:bg-surface-hover">
                <f.icon className="size-5 text-text-muted transition-colors group-hover:text-text" aria-hidden />
                <h3 className="mt-5 text-[16px] font-semibold tracking-[-0.01em]">{f.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-text-muted">{f.body}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="tour" eyebrow="See it" title="The screens your team will live in" className="pt-4 sm:pt-8">
          <ProductTour />
        </Section>

        <Section id="record" eyebrow="One customer record" title="Every step lands on the same timeline">
          <div className="grid items-start gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <p data-reveal className="max-w-[40ch] text-[16px] leading-relaxed text-text-muted">
              The email, who owned it and when, the escalation, the visit and the payment all sit on one contact page. When someone asks what happened, the answer is one scroll away.
            </p>
            <ol className="rounded-2xl border border-border bg-surface p-2 sm:p-3">
              {TIMELINE.map(([t, d, time, Icon], i) => (
                <li key={t} data-reveal style={{ "--d": `${i * 0.06}s` } as React.CSSProperties} className="flex items-start gap-4 rounded-xl px-3 py-3 hover:bg-surface-hover">
                  <Icon className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium">{t}</span>
                    <span className="block text-[13px] text-text-muted">{d}</span>
                  </span>
                  <span className="font-mono text-[12px] text-text-muted tabular-nums">{time}</span>
                </li>
              ))}
            </ol>
          </div>
        </Section>

        <section className="mx-auto w-full max-w-[1120px] px-5 pb-24 sm:px-8 sm:pb-32">
          <div data-reveal className="rounded-3xl bg-text px-6 py-16 text-center text-canvas sm:px-12 sm:py-20">
            <h2 className="mx-auto max-w-[18ch] text-[clamp(30px,4.6vw,52px)] leading-[1.06] font-semibold tracking-[-0.03em]">Stop losing leads to silence.</h2>
            <p className="mx-auto mt-4 max-w-[44ch] text-[16px] text-canvas/70">Set up your workspace, connect Gmail, and the next enquiry already has an owner.</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href={signedIn ? "/dashboard" : "/signup"} className="inline-flex h-12 items-center rounded-xl bg-canvas px-6 text-[15px] font-medium text-text hover:opacity-90">{signedIn ? "Open dashboard" : "Create your workspace"}</Link>
              {signedIn ? null : <Link href="/login" className="inline-flex h-12 items-center rounded-xl border border-canvas/25 px-5 text-[15px] font-medium hover:bg-canvas/10">Sign in</Link>}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-4 px-5 py-8 text-[13px] text-text-muted sm:px-8">
          <Wordmark size={22} className="text-[15px]" />
          <p>Built for NASCON. Every lead, one owner.</p>
          <nav aria-label="Footer" className="flex gap-5">
            <Link href="/login" className="hover:text-text">Sign in</Link>
            <Link href="/signup" className="hover:text-text">Create workspace</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
