import type { Metadata } from "next";
import { AuditPage } from "@/components/platform/OpsPages";

export const metadata: Metadata = { title: "Audit log" };

export default function Page() {
  return <AuditPage />;
}
