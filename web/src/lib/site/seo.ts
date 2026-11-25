import type { Metadata } from "next";
import { C, SITE, href, type Lang, type Page } from "./content";
import { FROM_PRICES, PERPETUAL_PACKS, SAAS_SEATS, SOURCE_CODE } from "./pricing";

const KEYWORDS: Record<Lang, string[]> = {
  en: ["maintenance management software", "CMMS", "CMMS Cameroon", "CMMS Africa", "maintenance software Cameroon", "maintenance software Africa",
    "maintenance software Central Africa", "maintenance software Nigeria", "maintenance software Ghana", "preventive maintenance software",
    "work order software", "asset management software", "biomedical equipment maintenance", "hospital maintenance software",
    "fuel station maintenance", "facility maintenance software", "Douala", "Yaoundé", "CEMAC"],
  fr: ["logiciel de maintenance", "GMAO", "GMAO Cameroun", "GMAO Afrique", "logiciel de gestion de la maintenance", "logiciel de maintenance Cameroun",
    "logiciel de maintenance Afrique centrale", "logiciel de maintenance Douala", "logiciel de maintenance Yaoundé", "maintenance préventive",
    "gestion des ordres de travail", "gestion des équipements", "maintenance biomédicale", "maintenance hospitalière",
    "maintenance station-service", "Gabon", "Congo", "Tchad", "Côte d'Ivoire", "CEMAC"],
};

export function pageMetadata(page: Page, lang: Lang): Metadata {
  const m = C[lang].meta[page];
  const url = SITE.url + href(lang, page);
  return {
    title: { absolute: page === "" ? m.title : `${m.title} · ${SITE.name}` },
    description: m.desc,
    keywords: KEYWORDS[lang],
    alternates: {
      canonical: url,
      languages: { en: SITE.url + href("en", page), fr: SITE.url + href("fr", page), "x-default": SITE.url + href("en", page) },
    },
    openGraph: {
      type: "website", url, siteName: SITE.name, title: m.title, description: m.desc,
      locale: lang === "fr" ? "fr_CM" : "en_CM", alternateLocale: lang === "fr" ? ["en_CM"] : ["fr_CM"],
    },
    twitter: { card: "summary_large_image", title: m.title, description: m.desc },
    robots: page === "privacy" || page === "terms" ? { index: true, follow: true } : undefined,
  };
}

/** Organization + website + software product: who we are, where, what we sell and from what price. */
export function siteJsonLd(lang: Lang) {
  const org = {
    "@type": "Organization", "@id": `${SITE.url}/#org`, name: SITE.company, url: SITE.url, logo: `${SITE.url}/favicon.svg`,
    brand: SITE.name,
    address: { "@type": "PostalAddress", addressLocality: SITE.city, addressCountry: SITE.country },
    areaServed: SITE.areaServed.map((c) => ({ "@type": "Country", name: c })),
    knowsLanguage: ["en", "fr"],
    contactPoint: { "@type": "ContactPoint", contactType: "sales", url: SITE.url + href(lang, "contact"), availableLanguage: ["English", "French"], areaServed: SITE.areaServed },
  };
  const app = {
    "@type": "SoftwareApplication", "@id": `${SITE.url}/#software`, name: SITE.name,
    applicationCategory: "BusinessApplication", applicationSubCategory: lang === "fr" ? "GMAO — gestion de la maintenance" : "CMMS — maintenance management",
    operatingSystem: "Web, iOS, Android", inLanguage: ["en", "fr"], url: SITE.url + href(lang, ""),
    description: C[lang].meta[""].desc, publisher: { "@id": `${SITE.url}/#org` },
    featureList: C[lang].features.groups.map((g) => g.title),
    offers: [
      ...SAAS_SEATS.map((s) => ({
        "@type": "Offer", name: `${C[lang].pricing.seats[s.code][0]} — ${lang === "fr" ? "abonnement mensuel" : "monthly subscription"}`,
        price: s.usd, priceCurrency: "USD", url: SITE.url + href(lang, "pricing"),
        priceSpecification: { "@type": "UnitPriceSpecification", price: s.usd, priceCurrency: "USD", unitText: lang === "fr" ? "utilisateur par mois" : "user per month" },
      })),
      ...PERPETUAL_PACKS.map((p) => ({
        "@type": "Offer", name: `${lang === "fr" ? "Licence perpétuelle" : "Perpetual license"} ${C[lang].licensing.perpetual.packs[p.code]} (${p.users})`,
        price: p.usd, priceCurrency: "USD", url: SITE.url + href(lang, "licensing"),
      })),
      { "@type": "Offer", name: lang === "fr" ? "Licence code source" : "Source code license", priceCurrency: "USD", url: SITE.url + href(lang, "licensing"),
        priceSpecification: { "@type": "PriceSpecification", minPrice: SOURCE_CODE.fromUsd, maxPrice: SOURCE_CODE.toUsd, priceCurrency: "USD" } },
    ],
  };
  const site = { "@type": "WebSite", "@id": `${SITE.url}/#website`, url: SITE.url, name: SITE.name, inLanguage: lang, publisher: { "@id": `${SITE.url}/#org` } };
  return { "@context": "https://schema.org", "@graph": [org, site, app] };
}

export function faqJsonLd(items: string[][]) {
  return {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: items.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
}

export function breadcrumbJsonLd(lang: Lang, page: Page) {
  const items = [{ name: C[lang].common.home, url: SITE.url + href(lang, "") }];
  if (page) items.push({ name: C[lang].meta[page].title.split(" — ")[0], url: SITE.url + href(lang, page) });
  return {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.url })),
  };
}

export { FROM_PRICES };
