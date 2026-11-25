"use client";
import { useState } from "react";
import { Icon } from "@/lib/icons";
import { ANNUAL_DISCOUNT, SAAS_SEATS } from "@/lib/site/pricing";
import { CurrencyPicker, RateNote, useMoney } from "./Money";

type Seat = [string, string];
type Lang = "en" | "fr";

const L = {
  en: {
    perUserMonth: "per user / month", perUserYear: "per user / year", billedYearly: "billed once a year", save: "You save",
    instead: "instead of", calcTitle: "Estimate your price", calcSub: "Enter your team size to see exactly what you would pay.",
    seat: "Seat", users: "Users", unit: "Price / user / month", months: "Months", amount: "Amount", free: "free",
    subtotal: "Subtotal (12 months)", discount: "Annual discount (−15%)", totalYear: "Total per year", totalMonth: "Total per month",
    equals: "Equivalent to", perMonth: "per month", billedOnce: "paid once a year", billedMonthly: "paid every month",
    switchAnnual: "See annual price (−15%)", less: "Fewer", more: "More", savings: "Your annual saving",
  },
  fr: {
    perUserMonth: "par utilisateur / mois", perUserYear: "par utilisateur / an", billedYearly: "facturé une fois par an", save: "Vous économisez",
    instead: "au lieu de", calcTitle: "Estimez votre prix", calcSub: "Indiquez la taille de votre équipe pour voir exactement ce que vous paieriez.",
    seat: "Profil", users: "Utilisateurs", unit: "Prix / utilisateur / mois", months: "Mois", amount: "Montant", free: "offerts",
    subtotal: "Sous-total (12 mois)", discount: "Remise annuelle (−15 %)", totalYear: "Total par an", totalMonth: "Total par mois",
    equals: "Soit", perMonth: "par mois", billedOnce: "payé une fois par an", billedMonthly: "payé chaque mois",
    switchAnnual: "Voir le prix annuel (−15 %)", less: "Moins", more: "Plus", savings: "Votre économie annuelle",
  },
};

function Stepper({ value, onChange, label, lang }: { value: number; onChange: (n: number) => void; label: string; lang: Lang }) {
  const t = L[lang];
  const clamp = (n: number) => Math.max(0, Math.min(9999, Math.floor(n) || 0));
  return (
    <div className="stepper">
      <button type="button" aria-label={`${t.less} — ${label}`} onClick={() => onChange(clamp(value - 1))}><Icon name="Minus" size={16} /></button>
      <input type="number" min={0} max={9999} inputMode="numeric" aria-label={label} value={value} onChange={(e) => onChange(clamp(Number(e.target.value)))} />
      <button type="button" aria-label={`${t.more} — ${label}`} onClick={() => onChange(clamp(value + 1))}><Icon name="Plus" size={16} /></button>
    </div>
  );
}

export function SeatPrices({ lang, t }: {
  lang: Lang;
  t: { monthly: string; annual: string; freeRequesters: string; seats: Record<string, Seat> };
}) {
  const s = L[lang];
  const money = useMoney(lang);
  const [annual, setAnnual] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({ ADMIN: 2, TECHNICIAN: 6, REQUESTER: 25 });
  const months = annual ? 12 : 1;

  // Every figure is computed in the visitor's currency from the quoted unit price, so the breakdown always adds up.
  const lines = SAAS_SEATS.map((seat) => {
    const n = counts[seat.code] ?? 0;
    const unit = money.unit(seat.usd);
    const billable = Math.max(0, n - seat.free);
    return { seat, n, unit, billable, freeUsed: Math.min(n, seat.free), amount: unit * billable * months };
  });
  const subtotal = lines.reduce((a, l) => a + l.amount, 0);
  const discount = annual ? Math.round(subtotal * ANNUAL_DISCOUNT) : 0;
  const total = subtotal - discount;

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
        {SAAS_SEATS.map((seat) => {
          const [name, desc] = t.seats[seat.code];
          const unit = money.unit(seat.usd);
          const yearFull = unit * 12;
          const yearDisc = yearFull - Math.round(yearFull * ANNUAL_DISCOUNT);
          return (
            <article className={"card seat" + (seat.code === "TECHNICIAN" ? " seat-featured" : "")} key={seat.code}>
              <h3>{name}</h3>
              {annual ? (
                <>
                  <div className="seat-price">{money.fmt(yearDisc)}</div>
                  <div className="seat-unit">{s.perUserYear} · {s.billedYearly}</div>
                  <div className="seat-was"><s>{money.fmt(yearFull)}</s><span className="save-pill">{s.save} {money.fmt(yearFull - yearDisc)}</span></div>
                </>
              ) : (
                <>
                  <div className="seat-price">{money.fmt(unit)}</div>
                  <div className="seat-unit">{s.perUserMonth}</div>
                </>
              )}
              <p>{desc}</p>
              {seat.free > 0 && <div className="seat-free"><Icon name="Gift" size={16} /> {t.freeRequesters}</div>}
            </article>
          );
        })}
      </div>

      <section className="calc" aria-labelledby="calc-title">
        <div className="calc-head">
          <div><h3 id="calc-title">{s.calcTitle}</h3><p>{s.calcSub}</p></div>
          {!annual && <button type="button" className="site-btn site-btn-secondary" onClick={() => setAnnual(true)}><Icon name="Percent" size={16} />{s.switchAnnual}</button>}
        </div>
        <div className="calc-table-wrap">
          <table className="calc-table">
            <thead>
              <tr><th scope="col">{s.seat}</th><th scope="col">{s.users}</th><th scope="col">{s.unit}</th>{annual && <th scope="col">{s.months}</th>}<th scope="col" className="num">{s.amount}</th></tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.seat.code}>
                  <th scope="row">{t.seats[l.seat.code][0]}</th>
                  <td><Stepper value={l.n} lang={lang} label={t.seats[l.seat.code][0]} onChange={(n) => setCounts((c) => ({ ...c, [l.seat.code]: n }))} /></td>
                  <td>{money.fmt(l.unit)}{l.freeUsed > 0 && <small className="free-note">{l.billable} × · {l.freeUsed} {s.free}</small>}</td>
                  {annual && <td>× 12</td>}
                  <td className="num">{money.fmt(l.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {annual && (
                <>
                  <tr><th scope="row" colSpan={4}>{s.subtotal}</th><td className="num">{money.fmt(subtotal)}</td></tr>
                  <tr className="calc-discount"><th scope="row" colSpan={4}>{s.discount}</th><td className="num">− {money.fmt(discount)}</td></tr>
                </>
              )}
              <tr className="calc-total">
                <th scope="row" colSpan={annual ? 4 : 3}>{annual ? s.totalYear : s.totalMonth}<small>{annual ? s.billedOnce : s.billedMonthly}</small></th>
                <td className="num">{money.fmt(total)}</td>
              </tr>
              {annual && <tr className="calc-equiv"><th scope="row" colSpan={4}>{s.equals}</th><td className="num">{money.fmt(total / 12)} {s.perMonth}</td></tr>}
            </tfoot>
          </table>
        </div>
      </section>
      <RateNote lang={lang} />
    </>
  );
}
