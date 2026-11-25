import type { Metadata } from "next";
import { AnnouncementsPage } from "@/components/platform/OpsPages";

export const metadata: Metadata = { title: "Announcements" };

export default function Page() {
  return <AnnouncementsPage />;
}
