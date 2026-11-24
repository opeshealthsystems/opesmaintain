import { IndustriesPage } from "@/components/site/Pages";
import { pageMetadata } from "@/lib/site/seo";
import "@/app/site.css";

export const metadata = pageMetadata("industries", "fr");

export default function Page() {
  return <IndustriesPage lang="fr" />;
}
