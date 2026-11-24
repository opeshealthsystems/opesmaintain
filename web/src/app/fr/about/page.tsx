import { AboutPage } from "@/components/site/Pages";
import { pageMetadata } from "@/lib/site/seo";
import "@/app/site.css";

export const metadata = pageMetadata("about", "fr");

export default function Page() {
  return <AboutPage lang="fr" />;
}
