import type { Metadata } from "next";
import { HealthPage } from "@/components/platform/OpsPages";

export const metadata: Metadata = { title: "System health" };

export default function Page() {
  return <HealthPage />;
}
