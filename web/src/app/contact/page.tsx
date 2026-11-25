import { ContactPage } from "@/components/site/Pages";
import { pageMetadata } from "@/lib/site/seo";
import "@/app/site.css";

export const metadata = pageMetadata("contact", "en");

export default function Page() {
  return <ContactPage lang="en" />;
}
