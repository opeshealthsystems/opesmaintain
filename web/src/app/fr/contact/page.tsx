import { ContactPage } from "@/components/site/Pages";
import { pageMetadata } from "@/lib/site/seo";
import "@/app/site.css";

export const metadata = pageMetadata("contact", "fr");

export default function Page() {
  return <ContactPage lang="fr" />;
}
