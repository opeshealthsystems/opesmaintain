import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site/content";

/** Public pages are open to all search engines and AI crawlers; the signed-in application is not. */
export default function robots(): MetadataRoute.Robots {
  const privateAreas = ["/api/", "/dashboard", "/m/", "/settings", "/work-board", "/dispatch", "/pm-board", "/stock", "/analytics",
    "/reports", "/modules", "/notifications", "/technician", "/portal", "/scan", "/inspect", "/print/", "/passport/", "/reset-password", "/forgot-password",
    "/onboarding", "/platform", "/support"];
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: privateAreas }],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
