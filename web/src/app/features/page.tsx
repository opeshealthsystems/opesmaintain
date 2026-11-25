import { FeaturesPage } from "@/components/site/Pages";
import { pageMetadata } from "@/lib/site/seo";
import "@/app/site.css";

export const metadata = pageMetadata("features", "en");

export default function Page() {
  return <FeaturesPage lang="en" />;
}
