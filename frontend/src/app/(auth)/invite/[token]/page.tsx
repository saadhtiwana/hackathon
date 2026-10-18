import { Suspense } from "react";
import { InviteForm } from "./invite-form";

export default function InvitePage() {
  return (
    <Suspense fallback={<p className="text-[13px] text-muted">Loading invite</p>}>
      <InviteForm />
    </Suspense>
  );
}
