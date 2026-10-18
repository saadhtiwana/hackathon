import { redirect } from "next/navigation";

// The team page replaced the users placeholder; keep the old link working.
export const metadata = { title: "Users & roles" };

export default function UsersSettingsPage() {
  redirect("/settings/team");
}
