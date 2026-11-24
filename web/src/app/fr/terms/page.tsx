import { LegalPage } from "@/components/site/Pages";
import { pageMetadata } from "@/lib/site/seo";
import "@/app/site.css";

export const metadata = pageMetadata("terms", "fr");

export default function Page() {
  return <LegalPage lang="fr" kind="terms" />;
}
