import type { Metadata } from "next";
import { TicketsPage } from "@/components/platform/OpsPages";

export const metadata: Metadata = { title: "Support desk" };

export default function Page() {
  return <TicketsPage />;
}
