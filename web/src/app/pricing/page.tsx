import { PricingPage } from "@/components/site/Pages";
import { pageMetadata } from "@/lib/site/seo";
import "@/app/site.css";

export const metadata = pageMetadata("pricing", "en");

export default function Page() {
  return <PricingPage lang="en" />;
}
