import { LicensingPage } from "@/components/site/Pages";
import { pageMetadata } from "@/lib/site/seo";
import "@/app/site.css";

export const metadata = pageMetadata("licensing", "en");

export default function Page() {
  return <LicensingPage lang="en" />;
}
