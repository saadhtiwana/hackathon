import { Suspense } from "react";
import { PublicLeadForm } from "@/features/leads/public-form";

export default function PublicFormPage() {
  return (
    <Suspense fallback={<p className="p-6 text-[13px] text-muted">Loading form</p>}>
      <PublicLeadForm />
    </Suspense>
  );
}
