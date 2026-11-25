import type { Metadata } from "next";
import { SignupsPage } from "@/components/platform/CustomerPages";

export const metadata: Metadata = { title: "Sign-ups" };

export default function Page() {
  return <SignupsPage />;
}
