import { Suspense } from "react";
import { OpportunityDetail } from "@/features/crm/opportunity-detail";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-[13px] text-text-muted">Loading opportunity</p>}>
      <OpportunityDetail />
    </Suspense>
  );
}
