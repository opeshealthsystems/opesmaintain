import type { Metadata } from "next";
import { OperatorsPage } from "@/components/platform/OpsPages";

export const metadata: Metadata = { title: "Operators" };

export default function Page() {
  return <OperatorsPage />;
}
