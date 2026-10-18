import { Placeholder } from "@/features/placeholder";

export default function PipelinesSettingsPage() {
  return (
    <Placeholder
      title="Pipelines & fields"
      description="Stages and the fields each pipeline asks for."
      crumbs={[{ href: "/", label: "Desk" }, { label: "Pipelines & fields" }]}
      body="Stage order, custom fields, and required fields per stage will be edited here."
    />
  );
}
