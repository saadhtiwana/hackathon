import { Placeholder } from "@/features/placeholder";

export default function NotificationsSettingsPage() {
  return (
    <Placeholder
      title="Notifications"
      description="Where escalation alerts reach you."
      crumbs={[{ href: "/", label: "Desk" }, { label: "Notifications" }]}
      body="Link a Telegram chat so the next owner hears about a lead outside the desk."
    />
  );
}
