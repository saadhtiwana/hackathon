import { Placeholder } from "@/features/placeholder";

export default function IntegrationsSettingsPage() {
  return (
    <Placeholder
      title="Integrations"
      description="WhatsApp, Stripe, Google Calendar, and Telegram."
      crumbs={[{ href: "/", label: "Desk" }, { label: "Integrations" }]}
      body="Connection status, the last success, and recent errors will list here. Secrets stay on the server."
    />
  );
}
