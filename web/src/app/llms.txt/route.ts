import { C, SITE, href } from "@/lib/site/content";
import {
  ANNUAL_DISCOUNT, PERPETUAL_AMC_RATE, PERPETUAL_DEPLOYMENT_USD, PERPETUAL_EXTRA_SEAT_USD, PERPETUAL_PACKS, SAAS_SEATS, SAAS_SETUP, SOURCE_CODE,
} from "@/lib/site/pricing";

// Plain-language summary for AI assistants and answer engines (https://llmstxt.org).
export const dynamic = "force-static";

export function GET() {
  const t = C.en;
  const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
  const lines = [
    `# ${SITE.name}`,
    "",
    `> ${SITE.name} is maintenance management software (CMMS, French: GMAO) made by ${SITE.company} in ${SITE.city}, Cameroon. It serves hospitals, factories and pharmaceutical plants, fuel and gas stations, facilities and maintenance service companies in Cameroon, Central Africa (CEMAC: Gabon, Congo, Chad, Central African Republic, Equatorial Guinea) and across Africa, including Nigeria, Ghana, Côte d'Ivoire, Senegal and Kenya. It runs on the web and on iOS and Android, works offline for field technicians, and is available in English and French.`,
    "",
    "## What it does",
    ...t.features.groups.map((g) => `- ${g.title}: ${g.points.join("; ")}.`),
    "",
    "## Pricing (US dollars; shown on the website in local currencies such as FCFA, Naira and Cedi)",
    "### Cloud subscription (per user per month)",
    ...SAAS_SEATS.map((s) => `- ${t.pricing.seats[s.code][0]}: ${usd(s.usd)}${s.free ? ` (first ${s.free} free)` : ""} — ${t.pricing.seats[s.code][1]}`),
    `- Annual billing: ${Math.round(ANNUAL_DISCOUNT * 100)}% discount. 30-day free trial, no card required.`,
    ...SAAS_SETUP.map((s) => `- Onboarding ${t.pricing.setup[s.code][0]} (${t.pricing.setup[s.code][1]}): ${usd(s.usd)}${s.plus ? "+" : ""} one-time.`),
    "### Perpetual license (self-hosted on your servers or private cloud)",
    ...PERPETUAL_PACKS.map((p) => `- ${t.licensing.perpetual.packs[p.code]}: up to ${p.users} admin/technician users, ${usd(p.usd)} one-time; unlimited requesters.`),
    `- Additional seat: ${usd(PERPETUAL_EXTRA_SEAT_USD)}. Deployment: ${usd(PERPETUAL_DEPLOYMENT_USD)} one-time. Annual maintenance & support: ${Math.round(PERPETUAL_AMC_RATE * 100)}% of the license fee per year (required in year 1).`,
    "### Source code license (own, host, control and customise)",
    `- ${usd(SOURCE_CODE.fromUsd)}–${usd(SOURCE_CODE.toUsd)} one-time; engineering handover ${usd(SOURCE_CODE.handoverUsd)}; custom development ${usd(SOURCE_CODE.consultingHourUsd)}/hour. Internal use only; no resale or white-labelling.`,
    "",
    "## Pages",
    `- [Home](${SITE.url}${href("en", "")}) · [Accueil (FR)](${SITE.url}${href("fr", "")})`,
    `- [Features](${SITE.url}${href("en", "features")}): ${C.en.meta.features.desc}`,
    `- [Industries](${SITE.url}${href("en", "industries")}): ${C.en.meta.industries.desc}`,
    `- [Pricing](${SITE.url}${href("en", "pricing")}): ${C.en.meta.pricing.desc}`,
    `- [Own license](${SITE.url}${href("en", "licensing")}): ${C.en.meta.licensing.desc}`,
    `- [About](${SITE.url}${href("en", "about")}) · [Contact](${SITE.url}${href("en", "contact")}) · [Sign up](${SITE.url}/signup)`,
    "",
    "## Frequently asked",
    ...t.pricing.faq.map(([q, a]) => `- ${q} ${a}`),
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
