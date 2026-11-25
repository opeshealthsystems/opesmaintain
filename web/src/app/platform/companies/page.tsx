import type { Metadata } from "next";
import { CompaniesPage } from "@/components/platform/CustomerPages";

export const metadata: Metadata = { title: "Companies" };

export default function Page() {
  return <CompaniesPage />;
}
