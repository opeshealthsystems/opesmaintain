import { HomePage } from "@/components/site/Pages";
import { pageMetadata } from "@/lib/site/seo";
import "@/app/site.css";

export const metadata = pageMetadata("", "fr");

export default function Page() {
  return <HomePage lang="fr" />;
}
