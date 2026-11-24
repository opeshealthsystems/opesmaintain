import { LegalPage } from "@/components/site/Pages";
import { pageMetadata } from "@/lib/site/seo";
import "@/app/site.css";

export const metadata = pageMetadata("privacy", "fr");

export default function Page() {
  return <LegalPage lang="fr" kind="privacy" />;
}
