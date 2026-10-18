import { Suspense } from "react";
import { ContactDetail } from "@/features/crm/contact-detail";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-[13px] text-text-muted">Loading contact</p>}>
      <ContactDetail />
    </Suspense>
  );
}
