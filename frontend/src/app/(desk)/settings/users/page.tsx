import { Placeholder } from "@/features/placeholder";

const crumbs = [
  { href: "/", label: "Desk" },
  { label: "Users & roles" },
];

export default function UsersSettingsPage() {
  return (
    <Placeholder
      title="Users & roles"
      description="Who can see records, values, and the audit log."
      crumbs={crumbs}
      body="Invites, base levels, and permission sets will be edited here."
    />
  );
}
