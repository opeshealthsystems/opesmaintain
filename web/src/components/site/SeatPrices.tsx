"use client";
import { useState } from "react";
import { Icon } from "@/lib/icons";
import { ANNUAL_DISCOUNT, SAAS_SEATS } from "@/lib/site/pricing";
import { CurrencyPicker, Price, RateNote } from "./Money";

type Seat = [string, string];

export function SeatPrices({ lang, t }: {
  lang: "en" | "fr";
  t: { monthly: string; annual: string; perUserMonth: string; billedAnnually: string; freeRequesters: string; seats: Record<string, Seat>; example: string; exampleText: string; exampleNote: string };
}) {
  const [annual, setAnnual] = useState(false);
  const f = annual ? 1 - ANNUAL_DISCOUNT : 1;
  const exampleUsd = (2 * 65 + 6 * 45 + (25 - 10) * 10) * f;
  return (
    <>
      <div className="price-controls">
        <div className="seg" role="group" aria-label={lang === "fr" ? "Période de facturation" : "Billing period"}>
          <button type="button" aria-pressed={!annual} onClick={() => setAnnual(false)}>{t.monthly}</button>
          <button type="button" aria-pressed={annual} onClick={() => setAnnual(true)}>{t.annual}</button>
        </div>
        <CurrencyPicker lang={lang} />
      </div>
      <div className="site-grid-3 seat-grid">
        {SAAS_SEATS.map((s) => {
          const [name, desc] = t.seats[s.code];
          return (
            <article className={"card seat" + (s.code === "TECHNICIAN" ? " seat-featured" : "")} key={s.code}>
              <h3>{name}</h3>
              <div className="seat-price"><Price usd={s.usd * f} lang={lang} /></div>
              <div className="seat-unit">{t.perUserMonth}{annual ? ` · ${t.billedAnnually}` : ""}</div>
              <p>{desc}</p>
              {s.free > 0 && <div className="seat-free"><Icon name="Gift" size={16} /> {t.freeRequesters}</div>}
            </article>
          );
        })}
      </div>
      <div className="example">
        <span className="example-label">{t.example}</span>
        <span>{t.exampleText} <small>({t.exampleNote})</small></span>
        <b><Price usd={exampleUsd} lang={lang} /> <small>/ {lang === "fr" ? "mois" : "month"}</small></b>
      </div>
      <RateNote lang={lang} />
    </>
  );
}
