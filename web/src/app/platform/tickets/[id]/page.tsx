"use client";
import { use } from "react";
import { TicketDetailPage } from "@/components/platform/OpsPages";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TicketDetailPage id={id} />;
}
