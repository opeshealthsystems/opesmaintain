import type { Metadata } from "next";
import { ConsoleShell } from "@/components/platform/ConsoleShell";
import "./platform.css";

export const metadata: Metadata = { title: { default: "Operator console", template: "%s · Operator console" }, robots: { index: false, follow: false } };

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return <ConsoleShell>{children}</ConsoleShell>;
}
