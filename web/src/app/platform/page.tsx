import type { Metadata } from "next";
import { DashboardPage } from "@/components/platform/CustomerPages";

export const metadata: Metadata = { title: "Dashboard" };

export default function Page() {
  return <DashboardPage />;
}
