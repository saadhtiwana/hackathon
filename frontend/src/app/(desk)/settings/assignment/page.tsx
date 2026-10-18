import { Placeholder } from "@/features/placeholder";

export default function AssignmentSettingsPage() {
  return (
    <Placeholder
      title="Assignment rules"
      description="Who receives the next lead, and how long they have."
      crumbs={[{ href: "/", label: "Desk" }, { label: "Assignment rules" }]}
      body="Round-robin, the acknowledgement window, and the escalation chain will be set here."
    />
  );
}
