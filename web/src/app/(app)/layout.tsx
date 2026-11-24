import { Suspense } from "react";
import { Shell } from "@/components/Shell";
import { Loading } from "@/components/ui";
import type { Metadata } from "next";

// The signed-in application is private: never index it.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Shell>
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </Shell>
  );
}
