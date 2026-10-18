import { Suspense } from "react";
import { CompanyDetail } from "@/features/crm/company-detail";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-[13px] text-text-muted">Loading company</p>}>
      <CompanyDetail />
    </Suspense>
  );
}
