import { CURRENCIES, FALLBACK_RATES } from "@/lib/site/pricing";

// Daily exchange rates (units per 1 USD) for indicative local prices. Cached for 24 h; falls back to built-in rates.
export const revalidate = 86400;

export async function GET() {
  let rates: Record<string, number> = { ...FALLBACK_RATES };
  let source = "fallback";
  let updated: string | null = null;
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD", { next: { revalidate: 86400 }, signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const j = (await r.json()) as { result?: string; rates?: Record<string, number>; time_last_update_utc?: string };
      if (j.result === "success" && j.rates) {
        for (const c of CURRENCIES) if (typeof j.rates[c.code] === "number" && j.rates[c.code] > 0) rates[c.code] = j.rates[c.code];
        source = "open.er-api.com";
        updated = j.time_last_update_utc ?? null;
      }
    }
  } catch {
    rates = { ...FALLBACK_RATES };
  }
  return Response.json({ base: "USD", rates, source, updated }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
