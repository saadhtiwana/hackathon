import { Placeholder } from "@/features/placeholder";

export default function AuditPage() {
  return (
    <Placeholder
      title="Audit log"
      description="Who changed what, and what it was before."
      crumbs={[{ href: "/", label: "Desk" }, { label: "Audit log" }]}
      body="Assignments, permission changes, and deletions will appear here. Entries cannot be edited."
    />
  );
}
