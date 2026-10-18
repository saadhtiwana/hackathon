"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMe } from "@/components/session";
import { Lockup } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

// One 404 for the whole app; wording adapts for payment and invite links.
export default function NotFound() {
  const me = useMe();
  const path = usePathname() ?? "";
  const pay = path.startsWith("/pay");
  const invite = path.startsWith("/invite") || path.startsWith("/accept-invite");
  const title = pay ? "This payment link isn't valid" : invite ? "This invite has expired or was already used" : "This page doesn't exist";
  const help = pay ? "Check the link in your email, or ask the business that sent it for a new one." : invite ? "Ask your admin to send a new invite." : "The link may be old or mistyped. Head back and pick up where you left off.";
  const signedIn = me.isSuccess;
  return (
    <main id="content" className="flex min-h-full flex-col items-center justify-center bg-canvas px-4 py-16 text-center">
      <Lockup size={32} />
      <h1 className="mt-10 text-[26px] font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-sm text-[14px] text-text-muted">{help}</p>
      <Button asChild className="mt-6">
        <Link href={signedIn ? "/dashboard" : "/login"}>{signedIn ? "Go to dashboard" : "Go to login"}</Link>
      </Button>
    </main>
  );
}
