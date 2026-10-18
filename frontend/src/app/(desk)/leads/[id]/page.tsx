import { Suspense } from "react";
import { LeadDetail } from "@/features/leads/detail";

export default function LeadPage() {
  return (
    <Suspense fallback={<p className="text-[13px] text-muted">Loading lead</p>}>
      <LeadDetail />
    </Suspense>
  );
}
