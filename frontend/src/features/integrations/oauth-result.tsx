"use client";

import { useSearchParams } from "next/navigation";
import { CircleCheck, CircleOff } from "lucide-react";

// Google sends people back here with ?google=connected|error after the consent screen.
export function OAuthResult() {
  const q = useSearchParams();
  const result = q.get("google");
  if (!result) return null;
  const ok = result === "connected";
  const what = q.get("purpose") === "mailbox" ? "Agency mailbox" : "Google Calendar";
  return (
    <p
      role="status"
      className={`mb-6 flex items-start gap-2 rounded-xl p-4 text-[13px] ${ok ? "bg-tint-green text-tint-green-text" : "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-danger"}`}
    >
      {ok ? <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CircleOff className="mt-0.5 size-4 shrink-0" aria-hidden />}
      {ok ? `${what} connected${q.get("account") ? ` as ${q.get("account")}` : ""}.` : `Google did not connect: ${q.get("reason") ?? "unknown error"}. Try again, and allow every requested permission.`}
    </p>
  );
}
