/**
 * Public price list (source of truth: USD) and currency display for the marketing site.
 * Local-currency amounts are indicative conversions at a daily exchange rate.
 */

export const SAAS_SEATS = [
  { code: "ADMIN", usd: 65, free: 0 },
  { code: "TECHNICIAN", usd: 45, free: 0 },
  { code: "REQUESTER", usd: 10, free: 10 },
] as const;

export const ANNUAL_DISCOUNT = 0.15;

export const SAAS_SETUP = [
  { code: "STANDARD", users: "1–15", usd: 1000, plus: false },
  { code: "GROWTH", users: "16–50", usd: 2500, plus: false },
  { code: "ENTERPRISE", users: "50+", usd: 5000, plus: true },
] as const;

export const PERPETUAL_PACKS = [
  { code: "STARTER", users: 10, usd: 18000 },
  { code: "MIDMARKET", users: 25, usd: 38000 },
  { code: "ENTERPRISE", users: 50, usd: 65000 },
] as const;
export const PERPETUAL_EXTRA_SEAT_USD = 1200;
export const PERPETUAL_AMC_RATE = 0.2;
export const PERPETUAL_DEPLOYMENT_USD = 4500;

export const SOURCE_CODE = { fromUsd: 85000, toUsd: 120000, handoverUsd: 10000, consultingHourUsd: 200 } as const;

/** Lowest public "from" price of each offer, used in structured data. */
export const FROM_PRICES = { saasMonthlyUsd: 10, perpetualUsd: 18000, sourceCodeUsd: 85000 } as const;

export type Currency = "USD" | "XAF" | "XOF" | "NGN" | "GHS" | "KES" | "RWF" | "CDF" | "ZAR" | "EUR" | "GBP" | "CAD";

export const CURRENCIES: { code: Currency; symbol: string; en: string; fr: string; after?: boolean }[] = [
  { code: "USD", symbol: "$", en: "US dollar", fr: "Dollar US" },
  { code: "XAF", symbol: "FCFA", en: "CFA franc (Central Africa)", fr: "Franc CFA (CEMAC)", after: true },
  { code: "XOF", symbol: "FCFA", en: "CFA franc (West Africa)", fr: "Franc CFA (UEMOA)", after: true },
  { code: "NGN", symbol: "₦", en: "Nigerian naira", fr: "Naira nigérian" },
  { code: "GHS", symbol: "GH₵", en: "Ghanaian cedi", fr: "Cedi ghanéen" },
  { code: "KES", symbol: "KSh", en: "Kenyan shilling", fr: "Shilling kényan" },
  { code: "RWF", symbol: "FRw", en: "Rwandan franc", fr: "Franc rwandais", after: true },
  { code: "CDF", symbol: "FC", en: "Congolese franc", fr: "Franc congolais", after: true },
  { code: "ZAR", symbol: "R", en: "South African rand", fr: "Rand sud-africain" },
  { code: "EUR", symbol: "€", en: "Euro", fr: "Euro", after: true },
  { code: "GBP", symbol: "£", en: "Pound sterling", fr: "Livre sterling" },
  { code: "CAD", symbol: "CA$", en: "Canadian dollar", fr: "Dollar canadien" },
];

/** Units of each currency per 1 USD (market rates of 25 Nov 2026). Fallback only; /rates.json serves live daily rates. */
export const FALLBACK_RATES: Record<Currency, number> = {
  USD: 1, XAF: 598.5, XOF: 598.5, NGN: 1366.8, GHS: 11.9, KES: 130, RWF: 1481.8, CDF: 2299.6, ZAR: 17.5, EUR: 0.9124, GBP: 0.7633, CAD: 1.4291,
};

const TZ_CURRENCY: Record<string, Currency> = {
  "Africa/Douala": "XAF", "Africa/Libreville": "XAF", "Africa/Brazzaville": "XAF", "Africa/Ndjamena": "XAF",
  "Africa/Bangui": "XAF", "Africa/Malabo": "XAF",
  "Africa/Abidjan": "XOF", "Africa/Dakar": "XOF", "Africa/Porto-Novo": "XOF", "Africa/Lome": "XOF",
  "Africa/Ouagadougou": "XOF", "Africa/Bamako": "XOF", "Africa/Niamey": "XOF", "Africa/Bissau": "XOF",
  "Africa/Lagos": "NGN", "Africa/Accra": "GHS", "Africa/Nairobi": "KES", "Africa/Kigali": "RWF",
  "Africa/Kinshasa": "CDF", "Africa/Lubumbashi": "CDF", "Africa/Johannesburg": "ZAR",
  "Europe/Paris": "EUR", "Europe/Brussels": "EUR", "Europe/Berlin": "EUR", "Europe/Madrid": "EUR", "Europe/Rome": "EUR",
  "Europe/Amsterdam": "EUR", "Europe/Lisbon": "EUR", "Europe/London": "GBP",
  "America/Toronto": "CAD", "America/Montreal": "CAD", "America/Vancouver": "CAD",
};

const REGION_CURRENCY: Record<string, Currency> = {
  CM: "XAF", GA: "XAF", CG: "XAF", TD: "XAF", CF: "XAF", GQ: "XAF",
  CI: "XOF", SN: "XOF", BJ: "XOF", TG: "XOF", BF: "XOF", ML: "XOF", NE: "XOF", GW: "XOF",
  NG: "NGN", GH: "GHS", KE: "KES", RW: "RWF", CD: "CDF", ZA: "ZAR",
  FR: "EUR", BE: "EUR", DE: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", PT: "EUR", GB: "GBP", CA: "CAD", US: "USD",
};

/** Best guess of the visitor's currency from their time zone, then their browser locale. Runs in the browser. */
export function detectCurrency(): Currency {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && TZ_CURRENCY[tz]) return TZ_CURRENCY[tz];
  } catch { /* old browser */ }
  for (const l of (typeof navigator !== "undefined" ? navigator.languages ?? [navigator.language] : [])) {
    const region = l?.split("-")[1]?.toUpperCase();
    if (region && REGION_CURRENCY[region]) return REGION_CURRENCY[region];
  }
  return "USD";
}

/**
 * Rounds a converted amount to a clean, quotable figure: steps of half the second significant digit
 * (6,010 → 6,000; 39,061 → 39,000; 22,846,000 → 23,000,000). USD and EUR/GBP/CAD keep whole units.
 */
export function niceAmount(value: number, currency: Currency): number {
  if (currency === "USD" || currency === "EUR" || currency === "GBP" || currency === "CAD" || value < 100) return Math.round(value);
  const digits = Math.floor(Math.log10(value)) + 1;
  const step = Math.pow(10, Math.max(0, digits - 2)) / 2;
  return Math.round(value / step) * step;
}

/** Formats an amount already expressed in `currency` (no conversion, no rounding beyond whole units). */
export function formatLocal(amount: number, currency: Currency, lang: "en" | "fr"): string {
  const c = CURRENCIES.find((x) => x.code === currency) ?? CURRENCIES[0];
  const n = new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-US", { maximumFractionDigits: 0 }).format(Math.round(amount)).replace(/ | /g, " ");
  return c.after ? `${n} ${c.symbol}` : `${c.symbol}${n}`;
}

/** Converts a USD list price into the visitor's currency as a clean, quotable figure. */
export function localPrice(usd: number, currency: Currency, rates: Record<string, number>): number {
  const rate = rates[currency] ?? FALLBACK_RATES[currency] ?? 1;
  return niceAmount(usd * rate, currency);
}

export function formatMoney(usd: number, currency: Currency, rates: Record<string, number>, lang: "en" | "fr"): string {
  return formatLocal(localPrice(usd, currency, rates), currency, lang);
}
