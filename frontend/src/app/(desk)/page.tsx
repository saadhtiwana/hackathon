import { Placeholder } from "@/features/placeholder";

export const metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <Placeholder
      title="Dashboard"
      description="Live counts for the company, or just your own desk."
      body="New leads, response time, the recovery queue, and payments collected this month will sit here."
    />
  );
}
