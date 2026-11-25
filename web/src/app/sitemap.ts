import type { MetadataRoute } from "next";
import { PAGES, SITE, href } from "@/lib/site/content";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const pages: MetadataRoute.Sitemap = PAGES.flatMap((p) =>
    (["en", "fr"] as const).map((lang) => ({
      url: SITE.url + href(lang, p),
      lastModified: now,
      changeFrequency: p === "" || p === "pricing" ? "weekly" : "monthly",
      priority: p === "" ? 1 : p === "pricing" || p === "licensing" || p === "features" ? 0.9 : p === "privacy" || p === "terms" ? 0.3 : 0.7,
      alternates: { languages: { en: SITE.url + href("en", p), fr: SITE.url + href("fr", p) } },
    })),
  );
  return [...pages, { url: `${SITE.url}/signup`, lastModified: now, changeFrequency: "monthly", priority: 0.8 }];
}
