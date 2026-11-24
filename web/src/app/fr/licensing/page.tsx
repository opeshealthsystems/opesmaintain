import { LicensingPage } from "@/components/site/Pages";
import { pageMetadata } from "@/lib/site/seo";
import "@/app/site.css";

export const metadata = pageMetadata("licensing", "fr");

export default function Page() {
  return <LicensingPage lang="fr" />;
}
