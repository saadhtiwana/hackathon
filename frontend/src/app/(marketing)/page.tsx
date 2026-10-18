import type { Metadata } from "next";
import { HomePage } from "@/features/home/home-page";

export const metadata: Metadata = {
  title: "Relay — every lead has one owner",
  description: "Inbound leads get one owner, a visible acknowledgement clock, and an automatic handoff if nobody answers.",
};

export default function Page() {
  return <HomePage />;
}
