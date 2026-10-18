"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Invite emails link here; the acceptance form lives at /invite/<token>.
function Redirect() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  useEffect(() => {
    router.replace(token ? `/invite/${encodeURIComponent(token)}` : "/login");
  }, [router, token]);
  return <p className="p-8 text-center text-[14px] text-text-muted">Opening your invite…</p>;
}

export default function AcceptInvite() {
  return (
    <Suspense fallback={null}>
      <Redirect />
    </Suspense>
  );
}
