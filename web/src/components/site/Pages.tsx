import Link from "next/link";
import { Icon } from "@/lib/icons";
import { C, href, type Lang } from "@/lib/site/content";
import {
  PERPETUAL_AMC_RATE, PERPETUAL_DEPLOYMENT_USD, PERPETUAL_EXTRA_SEAT_USD, PERPETUAL_PACKS, SAAS_SETUP, SOURCE_CODE,
} from "@/lib/site/pricing";
import { breadcrumbJsonLd, faqJsonLd } from "@/lib/site/seo";
import { ContactForm } from "./ContactForm";
import { CurrencyPicker, Price, RateNote } from "./Money";
import { SeatPrices } from "./SeatPrices";
import { JsonLd, SiteShell } from "./SiteChrome";

const signup = (lang: Lang) => `/signup${lang === "fr" ? "?lang=fr" : ""}`;

function PageHero({ title, sub, kicker }: { title: string; sub: string; kicker?: string }) {
  return (
    <section className="page-hero">
      <div className="site-wrap">
        {kicker && <p className="kicker">{kicker}</p>}
        <h1>{title}</h1>
        <p className="lead">{sub}</p>
      </div>
    </section>
  );
}

function Cta({ lang, title, sub }: { lang: Lang; title: string; sub: string }) {
  const t = C[lang];
  return (
    <section className="band band-ink">
      <div className="site-wrap cta-row">
        <div><h2>{title}</h2><p>{sub}</p></div>
        <div className="btn-row">
          <Link href={signup(lang)} className="site-btn site-btn-primary site-btn-lg">{t.startTrial}<Icon name="ArrowRight" size={18} /></Link>
          <Link href={href(lang, "contact")} className="site-btn site-btn-onink site-btn-lg">{t.talkToUs}</Link>
        </div>
      </div>
    </section>
  );
}

function Faq({ items, title }: { items: string[][]; title: string }) {
  return (
    <section className="band">
      <div className="site-wrap narrow">
        <h2>{title}</h2>
        <div className="faq">{items.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
      </div>
      <JsonLd data={faqJsonLd(items)} />
    </section>
  );
}

/* ------------------------------------------------------------------ home */
export function HomePage({ lang }: { lang: Lang }) {
  const t = C[lang];
  const h = t.home;
  const faq = [...t.pricing.faq.slice(0, 2), [t.meta.licensing.title, t.meta.licensing.desc]];
  return (
    <SiteShell lang={lang} page="">
      <section className="hero">
        <div className="site-wrap hero-grid">
          <div>
            <p className="kicker kicker-onink">{h.kicker}</p>
            <h1>{h.title}</h1>
            <p className="lead">{h.sub}</p>
            <div className="btn-row">
              <Link href={signup(lang)} className="site-btn site-btn-primary site-btn-lg">{t.startTrial}<Icon name="ArrowRight" size={18} /></Link>
              <Link href={href(lang, "contact") + "?topic=demo"} className="site-btn site-btn-onink site-btn-lg">{lang === "fr" ? "Demander une démo" : "Book a demo"}</Link>
            </div>
            <p className="hero-note">{h.note}</p>
          </div>
          <ProductPreview lang={lang} />
        </div>
        <div className="site-wrap proofs">
          {h.proofs.map(([b, s]) => <div key={b}><b>{b}</b><span>{s}</span></div>)}
        </div>
      </section>

      <section className="band">
        <div className="site-wrap">
          <h2>{h.whoTitle}</h2>
          <div className="site-grid-4">
            {h.who.map(([i, ti, tx]) => (
              <article className="card" key={ti}><span className="ico"><Icon name={i} size={22} /></span><h3>{ti}</h3><p>{tx}</p></article>
            ))}
          </div>
          <p className="more"><Link href={href(lang, "industries")}>{t.nav.industries} <Icon name="ArrowRight" size={16} /></Link></p>
        </div>
      </section>

      <section className="band band-soft">
        <div className="site-wrap">
          <h2>{h.howTitle}</h2>
          <ol className="steps">
            {h.how.map(([ti, tx], i) => <li key={ti}><span className="step-n">{i + 1}</span><h3>{ti}</h3><p>{tx}</p></li>)}
          </ol>
          <p className="more"><Link href={href(lang, "features")}>{t.nav.features} <Icon name="ArrowRight" size={16} /></Link></p>
        </div>
      </section>

      <section className="band">
        <div className="site-wrap">
          <h2>{h.assetsTitle}</h2>
          <p className="lead">{h.assetsSub}</p>
          <ul className="chips">{t.assetTypes.map(([i, l]) => <li key={l}><Icon name={i} size={18} />{l}</li>)}</ul>
        </div>
      </section>

      <section className="band band-soft">
        <div className="site-wrap">
          <h2>{h.deployTitle}</h2>
          <div className="site-grid-3">
            {h.deploy.map(([ti, tx, page, link], i) => (
              <article className="card card-link" key={ti}>
                <span className="ico"><Icon name={["Cloud", "Server", "Code"][i]} size={22} /></span>
                <h3>{ti}</h3><p>{tx}</p>
                <p className="from">{lang === "fr" ? "À partir de" : "From"} <Price usd={[10, 18000, 85000][i]} lang={lang} />{i === 0 ? (lang === "fr" ? " / utilisateur / mois" : " / user / month") : ""}</p>
                <Link href={href(lang, page)} className="card-cta">{link} <Icon name="ArrowRight" size={16} /></Link>
              </article>
            ))}
          </div>
          <RateNote lang={lang} />
        </div>
      </section>

      <Faq items={faq} title={t.common.faq} />
      <Cta lang={lang} title={h.ctaTitle} sub={h.ctaSub} />
    </SiteShell>
  );
}

function ProductPreview({ lang }: { lang: Lang }) {
  const fr = lang === "fr";
  const rows: [string, string, string, string][] = [
    [fr ? "OT-2041" : "WO-2041", fr ? "Respirateur — alarme pression" : "Ventilator — pressure alarm", fr ? "En cours" : "In progress", "info"],
    [fr ? "OT-2038" : "WO-2038", fr ? "Groupe 250 kVA — révision 500 h" : "250 kVA generator — 500 h service", fr ? "Planifié" : "Scheduled", "ok"],
    [fr ? "OT-2035" : "WO-2035", fr ? "Pompe 3 — fuite au pistolet" : "Pump 3 — nozzle leak", fr ? "Attente pièces" : "Awaiting parts", "warn"],
  ];
  return (
    <figure className="preview" aria-label={fr ? "Aperçu du tableau de bord" : "Dashboard preview"}>
      <div className="preview-top"><span /><span /><span /></div>
      <div className="preview-kpis">
        {[[fr ? "OT ouverts" : "Open work orders", "18"], [fr ? "Respect MP" : "PM compliance", "94 %"], [fr ? "Disponibilité" : "Availability", "98,7 %"], ["MTTR", "3,2 h"]].map(([l, v]) => (
          <div key={l}><span>{l}</span><b>{fr ? v : v.replace(",", ".").replace(" %", "%")}</b></div>
        ))}
      </div>
      <div className="preview-list">
        {rows.map(([n, d, s, tone]) => <div key={n}><code>{n}</code><span>{d}</span><em className={`tag tag-${tone}`}>{s}</em></div>)}
      </div>
    </figure>
  );
}

/* ------------------------------------------------------------------ features */
export function FeaturesPage({ lang }: { lang: Lang }) {
  const t = C[lang];
  const f = t.features;
  return (
    <SiteShell lang={lang} page="features">
      <JsonLd data={breadcrumbJsonLd(lang, "features")} />
      <PageHero title={f.title} sub={f.sub} kicker={t.nav.features} />
      <section className="band">
        <div className="site-wrap site-grid-3">
          {f.groups.map((g) => (
            <article className="card" key={g.title}>
              <span className="ico"><Icon name={g.icon} size={22} /></span>
              <h2 className="h3">{g.title}</h2>
              <ul className="ticks">{g.points.map((p) => <li key={p}><Icon name="Check" size={16} />{p}</li>)}</ul>
            </article>
          ))}
        </div>
      </section>
      <section className="band band-soft">
        <div className="site-wrap">
          <h2>{f.platformTitle}</h2>
          <dl className="facts">{f.platform.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        </div>
      </section>
      <Cta lang={lang} title={t.home.ctaTitle} sub={t.home.ctaSub} />
    </SiteShell>
  );
}

/* ------------------------------------------------------------------ pricing */
export function PricingPage({ lang }: { lang: Lang }) {
  const t = C[lang];
  const p = t.pricing;
  return (
    <SiteShell lang={lang} page="pricing">
      <JsonLd data={breadcrumbJsonLd(lang, "pricing")} />
      <PageHero title={p.title} sub={p.sub} kicker={t.nav.pricing} />
      <section className="band">
        <div className="site-wrap">
          <SeatPrices lang={lang} t={p} />
        </div>
      </section>
      <section className="band band-soft">
        <div className="site-wrap two-col">
          <div>
            <h2>{p.includedTitle}</h2>
            <ul className="ticks ticks-lg">{p.included.map((i) => <li key={i}><Icon name="Check" size={18} />{i}</li>)}</ul>
          </div>
          <div>
            <h2>{p.setupTitle}</h2>
            <p className="muted-text">{p.setupSub}</p>
            <div className="rows">
              {SAAS_SETUP.map((s) => {
                const [name, users, text] = p.setup[s.code];
                return (
                  <div className="row-item" key={s.code}>
                    <div><b>{name}</b> <span className="pill">{users}</span><p>{text}</p></div>
                    <div className="row-price"><Price usd={s.usd} lang={lang} />{s.plus ? "+" : ""}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
      <section className="band">
        <div className="site-wrap own-box">
          <div><h2>{p.ownTitle}</h2><p>{p.ownSub}</p></div>
          <Link href={href(lang, "licensing")} className="site-btn site-btn-secondary site-btn-lg">{p.ownCta}<Icon name="ArrowRight" size={18} /></Link>
        </div>
      </section>
      <Faq items={p.faq} title={t.common.faq} />
      <Cta lang={lang} title={t.home.ctaTitle} sub={t.home.ctaSub} />
    </SiteShell>
  );
}

/* ------------------------------------------------------------------ licensing */
export function LicensingPage({ lang }: { lang: Lang }) {
  const t = C[lang];
  const l = t.licensing;
  const pp = l.perpetual;
  const sc = l.source;
  const quote = href(lang, "contact");
  return (
    <SiteShell lang={lang} page="licensing">
      <JsonLd data={breadcrumbJsonLd(lang, "licensing")} />
      <PageHero title={l.title} sub={l.sub} kicker={t.nav.licensing} />
      <section className="band">
        <div className="site-wrap">
          <div className="price-controls"><span /><CurrencyPicker lang={lang} /></div>
          <p className="kicker">{pp.kicker}</p>
          <h2>{pp.title}</h2>
          <p className="lead">{pp.sub}</p>
          <p className="best-for"><Icon name="Target" size={18} />{pp.bestFor}</p>
          <div className="site-grid-3">
            {PERPETUAL_PACKS.map((k) => (
              <article className={"card seat" + (k.code === "MIDMARKET" ? " seat-featured" : "")} key={k.code}>
                <h3>{pp.packs[k.code]}</h3>
                <div className="seat-price"><Price usd={k.usd} lang={lang} /></div>
                <div className="seat-unit">{pp.oneTime}</div>
                <ul className="ticks">
                  <li><Icon name="Users" size={16} />{pp.upTo} {k.users} {pp.users}</li>
                  <li><Icon name="Infinity" size={16} />{pp.unlimitedRequesters}</li>
                </ul>
                <Link href={`${quote}?topic=perpetual`} className="site-btn site-btn-secondary">{l.cta}</Link>
              </article>
            ))}
          </div>
          <div className="rows rows-boxed">
            <div className="row-item"><div><b>{pp.extraSeat}</b></div><div className="row-price"><Price usd={PERPETUAL_EXTRA_SEAT_USD} lang={lang} /></div></div>
            <div className="row-item"><div><b>{pp.deploy}</b><p>{pp.deployText}</p></div><div className="row-price"><Price usd={PERPETUAL_DEPLOYMENT_USD} lang={lang} /></div></div>
            <div className="row-item"><div><b>{pp.amcTitle}</b><p>{pp.amcText}</p></div><div className="row-price">{Math.round(PERPETUAL_AMC_RATE * 100)} %</div></div>
          </div>
        </div>
      </section>
      <section className="band band-soft">
        <div className="site-wrap">
          <p className="kicker">{sc.kicker}</p>
          <h2>{sc.title}</h2>
          <p className="lead">{sc.sub}</p>
          <p className="best-for"><Icon name="Target" size={18} />{sc.bestFor}</p>
          <div className="two-col">
            <article className="card seat seat-featured">
              <h3>{lang === "fr" ? "Licence code source" : "Source code license"}</h3>
              <div className="seat-price"><Price usd={SOURCE_CODE.fromUsd} to={SOURCE_CODE.toUsd} lang={lang} /></div>
              <div className="seat-unit">{sc.range}</div>
              <div className="rows">
                <div className="row-item"><div><b>{sc.handover}</b><p>{sc.handoverText}</p></div><div className="row-price"><Price usd={SOURCE_CODE.handoverUsd} lang={lang} /></div></div>
                <div className="row-item"><div><b>{sc.consulting}</b><p>{sc.perHour}</p></div><div className="row-price"><Price usd={SOURCE_CODE.consultingHourUsd} lang={lang} /></div></div>
              </div>
              <Link href={`${quote}?topic=source`} className="site-btn site-btn-primary">{l.cta}</Link>
            </article>
            <div>
              <h3>{sc.termsTitle}</h3>
              <ul className="ticks ticks-lg">{sc.terms.map((x) => <li key={x}><Icon name="ShieldCheck" size={18} />{x}</li>)}</ul>
            </div>
          </div>
          <RateNote lang={lang} />
        </div>
      </section>
      <section className="band">
        <div className="site-wrap">
          <h2>{l.compareTitle}</h2>
          <div className="table-wrap">
            <table className="compare">
              <thead><tr>{l.compare.head.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
              <tbody>{l.compare.rows.map((r) => <tr key={r[0]}><th scope="row">{r[0]}</th>{r.slice(1).map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </div>
      </section>
      <Cta lang={lang} title={l.cta} sub={l.ctaSub} />
    </SiteShell>
  );
}

/* ------------------------------------------------------------------ industries */
export function IndustriesPage({ lang }: { lang: Lang }) {
  const t = C[lang];
  const ind = t.industries;
  return (
    <SiteShell lang={lang} page="industries">
      <JsonLd data={breadcrumbJsonLd(lang, "industries")} />
      <PageHero title={ind.title} sub={ind.sub} kicker={t.nav.industries} />
      <section className="band">
        <div className="site-wrap industry-list">
          {ind.list.map((x) => (
            <article className="industry" key={x.title}>
              <span className="ico ico-lg"><Icon name={x.icon} size={26} /></span>
              <div>
                <h2 className="h3">{x.title}</h2>
                <p>{x.text}</p>
                <ul className="ticks">{x.points.map((p) => <li key={p}><Icon name="Check" size={16} />{p}</li>)}</ul>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="band band-soft">
        <div className="site-wrap narrow">
          <h2>{ind.regionTitle}</h2>
          <p className="lead">{ind.regionText}</p>
        </div>
      </section>
      <Cta lang={lang} title={t.home.ctaTitle} sub={t.home.ctaSub} />
    </SiteShell>
  );
}

/* ------------------------------------------------------------------ about */
export function AboutPage({ lang }: { lang: Lang }) {
  const t = C[lang];
  const a = t.about;
  return (
    <SiteShell lang={lang} page="about">
      <JsonLd data={breadcrumbJsonLd(lang, "about")} />
      <PageHero title={a.title} sub={a.lead} kicker={t.nav.about} />
      <section className="band">
        <div className="site-wrap narrow prose">{a.body.map((p) => <p key={p.slice(0, 24)}>{p}</p>)}</div>
      </section>
      <section className="band band-soft">
        <div className="site-wrap">
          <h2>{a.valuesTitle}</h2>
          <div className="site-grid-4">{a.values.map(([k, v]) => <article className="card" key={k}><h3>{k}</h3><p>{v}</p></article>)}</div>
        </div>
      </section>
      <Cta lang={lang} title={t.home.ctaTitle} sub={t.home.ctaSub} />
    </SiteShell>
  );
}

/* ------------------------------------------------------------------ contact */
export function ContactPage({ lang }: { lang: Lang }) {
  const t = C[lang];
  const c = t.contact;
  return (
    <SiteShell lang={lang} page="contact">
      <JsonLd data={breadcrumbJsonLd(lang, "contact")} />
      <PageHero title={c.title} sub={c.sub} kicker={t.nav.contact} />
      <section className="band">
        <div className="site-wrap contact-grid">
          <ContactForm lang={lang} t={c.form} topics={c.topics} />
          <aside className="contact-facts">
            <div><Icon name="MapPin" size={20} /><div><b>{c.office}</b><span>{c.officeText}</span></div></div>
            <div><Icon name="Clock" size={20} /><div><b>{c.hours}</b><span>{c.hoursText}</span></div></div>
            <div><Icon name="Languages" size={20} /><div><b>{c.languages}</b><span>{c.languagesText}</span></div></div>
          </aside>
        </div>
      </section>
    </SiteShell>
  );
}

/* ------------------------------------------------------------------ legal */
export function LegalPage({ lang, kind }: { lang: Lang; kind: "privacy" | "terms" }) {
  const t = C[lang];
  const sections = t.legal[kind];
  return (
    <SiteShell lang={lang} page={kind}>
      <PageHero title={t.meta[kind].title} sub={t.legal.updated} />
      <section className="band">
        <div className="site-wrap narrow prose">
          {sections.map(([h, p]) => <section key={h}><h2 className="h3">{h}</h2><p>{p}</p></section>)}
        </div>
      </section>
    </SiteShell>
  );
}

