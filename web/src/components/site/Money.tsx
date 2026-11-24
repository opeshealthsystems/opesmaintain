"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { CURRENCIES, FALLBACK_RATES, detectCurrency, formatMoney, type Currency } from "@/lib/site/pricing";

type Lang = "en" | "fr";
const KEY = "opes.currency";
const Ctx = createContext<{ currency: Currency; rates: Record<string, number>; setCurrency: (c: Currency) => void }>({
  currency: "USD", rates: FALLBACK_RATES, setCurrency: () => {},
});

/** Holds the visitor's currency (auto-detected, overridable) and today's rates. Server HTML shows USD. */
export function MoneyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCur] = useState<Currency>("USD");
  const [rates, setRates] = useState<Record<string, number>>(FALLBACK_RATES);
  useEffect(() => {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(KEY); } catch { /* blocked */ }
    setCur(CURRENCIES.some((c) => c.code === saved) ? (saved as Currency) : detectCurrency());
    fetch("/rates.json").then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.rates) setRates(j.rates); }).catch(() => {});
  }, []);
  const setCurrency = (c: Currency) => {
    setCur(c);
    try { window.localStorage.setItem(KEY, c); } catch { /* blocked */ }
  };
  return <Ctx.Provider value={{ currency, rates, setCurrency }}>{children}</Ctx.Provider>;
}

export function Price({ usd, lang, to }: { usd: number; lang: Lang; to?: number }) {
  const { currency, rates } = useContext(Ctx);
  const a = formatMoney(usd, currency, rates, lang);
  return <span className="price">{to ? `${a} – ${formatMoney(to, currency, rates, lang)}` : a}</span>;
}

export function CurrencyPicker({ lang }: { lang: Lang }) {
  const { currency, setCurrency } = useContext(Ctx);
  return (
    <label className="currency-picker">
      <span>{lang === "fr" ? "Devise" : "Currency"}</span>
      <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
        {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c[lang]}</option>)}
      </select>
    </label>
  );
}

/** Small note under converted prices; shown only when the visitor is not viewing USD. */
export function RateNote({ lang }: { lang: Lang }) {
  const { currency } = useContext(Ctx);
  if (currency === "USD") return null;
  return (
    <p className="rate-note">
      {lang === "fr"
        ? "Montants en devise locale indicatifs, convertis au taux du jour depuis le dollar US. La facture est établie dans la devise convenue au contrat."
        : "Local-currency amounts are indicative, converted from US dollars at today's rate. Invoices are issued in the currency agreed in your contract."}
    </p>
  );
}
