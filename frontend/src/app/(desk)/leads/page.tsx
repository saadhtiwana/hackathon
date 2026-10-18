import { Suspense } from "react";
import { LeadsInbox } from "@/features/leads/inbox";

export const metadata = { title: "Leads" };

export default function LeadsPage() {
  return (
    <Suspense fallback={<p className="text-[13px] text-text-muted">Loading leads</p>}>
      <LeadsInbox />
    </Suspense>
  );
}
