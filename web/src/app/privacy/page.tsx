import { LegalPage } from "@/components/site/Pages";
import { pageMetadata } from "@/lib/site/seo";
import "@/app/site.css";

export const metadata = pageMetadata("privacy", "en");

export default function Page() {
  return <LegalPage lang="en" kind="privacy" />;
}
