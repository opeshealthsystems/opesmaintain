import type { Metadata } from "next";
import { PlatformConsole } from "@/components/PlatformConsole";
import "./platform.css";

export const metadata: Metadata = { title: "Operator console", robots: { index: false, follow: false } };

export default function PlatformPage() {
  return <PlatformConsole />;
}
