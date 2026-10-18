"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/cn";

type Step = { key: string; title: string; body: string; href: string; cta: string; done: boolean; detail: string; extra?: { formPath?: string } };
type Data = { steps: Step[]; completed: number; total: number; workspaceSlug: string };

export const useOnboarding = (enabled = true) => useQuery({ queryKey: ["onboarding"], enabled, queryFn: () => apiFetch<Data>("/onboarding"), refetchOnWindowFocus: true });

// A guided setup that ticks itself off from real data. Each step says what it is for and takes you straight there.
export function OnboardingPage() {
  const q = useOnboarding();
  const d = q.data;
  const next = d?.steps.find((s) => !s.done);
  const pct = d ? Math.round((d.completed / d.total) * 100) : 0;
  return (
    <div className="mx-auto max-w-[720px]">
      <PageHeader title="Get started" description="Six short steps and your team is handling leads. Do them in any order; each one ticks off by itself." />
      {q.isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : q.isError ? (
        <div className="flex flex-col items-start gap-2">
          <Notice error={q.error} />
          <Button size="sm" variant="quiet" onClick={() => void q.refetch()}>Retry</Button>
        </div>
      ) : d ? (
        <>
          <div className="mb-6">
            <div className="mb-2 flex items-baseline justify-between text-[13px]">
              <span className="font-medium">{d.completed === d.total ? "All set. Your team is ready." : `${d.completed} of ${d.total} done`}</span>
              <span className="tabular-nums text-text-muted">{pct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Setup progress">
              <div className="h-full rounded-full bg-text transition-[width] duration-700" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <ol className="flex flex-col gap-3">
            {d.steps.map((s, i) => {
              const current = next?.key === s.key;
              return (
                <li key={s.key} className={cn("flex gap-4 rounded-xl border bg-surface p-4 sm:p-5", current ? "border-text" : "border-border", s.done && "opacity-80")}>
                  <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold tabular-nums", s.done ? "border-text bg-text text-canvas" : "border-border-strong text-text-muted")} aria-hidden>
                    {s.done ? <Check className="size-4" /> : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <h2 className="text-[15px] font-semibold">{s.title}</h2>
                      <span className="text-[12px] text-text-muted">{s.done ? "Done" : "To do"} · {s.detail}</span>
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-text-muted">{s.body}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button asChild size="sm" variant={current ? "primary" : "quiet"}>
                        <Link href={s.href}>
                          {s.done ? "Review" : s.cta}
                          {!s.done ? <ArrowRight className="size-3.5" aria-hidden /> : null}
                        </Link>
                      </Button>
                      {s.extra?.formPath ? (
                        <Button asChild size="sm" variant="ghost">
                          <a href={s.extra.formPath} target="_blank" rel="noreferrer">
                            Open the enquiry form <ExternalLink className="size-3.5" aria-hidden />
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="mt-6 text-[13px] text-text-muted">
            New to Relay? Every lead has one owner and a countdown. If nobody acknowledges it in time it moves to the next person, then a backup, then a manager. You can change any of this later in Settings.
          </p>
        </>
      ) : null}
    </div>
  );
}
