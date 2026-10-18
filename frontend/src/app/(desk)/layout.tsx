import { DeskShell } from "@/components/shell/desk-shell";

export default function DeskLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <DeskShell>{children}</DeskShell>;
}
