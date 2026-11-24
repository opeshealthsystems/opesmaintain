"use client";
import Link from "next/link";
import { Icon } from "@/lib/icons";
import { ASSET_TYPES, PLANS, dict, usePublicLang } from "@/lib/public-i18n";
import { PublicFooter, PublicHeader } from "./PublicChrome";

export function Landing() {
  const [lang, setLang] = usePublicLang();
  const t = dict(lang);
  const nav: [string, string][] = [
    ["#features", t.nav_features], ["#assets", t.nav_assets], ["#how", t.nav_how], ["#pricing", t.nav_pricing], ["#faq", t.nav_faq],
  ];

  return (
    <div className="pub">
      <PublicHeader lang={lang} setLang={setLang} nav={nav} signIn={t.sign_in} cta={t.start_trial} openApp={t.open_app} />
      <main id="main">
        {/* Hero */}
        <section className="hero">
          <div className="pub-wrap">
            <div>
              <div className="pub-kicker">{t.hero_kicker}</div>
              <h1>{t.hero_title}</h1>
              <p className="pub-lead">{t.hero_sub}</p>
              <div className="hero-actions">
                <Link href="/signup" className="btn btn-primary btn-lg">{t.start_trial}<Icon name="ArrowRight" size={16} /></Link>
                <Link href="/login" className="btn btn-lg">{t.sign_in}</Link>
              </div>
              <div className="hero-note">{t.hero_note}</div>
            </div>
            <div className="preview" aria-hidden="true">
              <div className="preview-bar"><i /><i /><i /></div>
              <div className="preview-body">
                <div className="preview-kpis">
                  {[[t.preview_open, "18"], [t.preview_pm, "94%"], [t.preview_avail, "98.7%"], [t.preview_mttr, "3.2 h"]].map(([l, v]) => (
                    <div className="preview-kpi" key={l}><span>{l}</span><b>{v}</b></div>
                  ))}
                </div>
                <div className="preview-list">
                  {t.preview_rows.map(([n, d, s], i) => (
                    <div className="preview-row" key={n}>
                      <code>{n}</code><span>{d}</span>
                      <span className={"pill" + (i === 1 ? " ok" : i === 2 ? " warn" : "")}>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Who it is for */}
        <section className="pub-section alt">
          <div className="pub-wrap">
            <h2 className="pub-h2">{t.who_title}</h2>
            <div className="pub-grid-4">
              {t.who.map(([icon, title, text]) => (
                <div className="pub-tile" key={title}>
                  <div className="pub-icon"><Icon name={icon} size={20} /></div>
                  <h3>{title}</h3><p>{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Asset types */}
        <section className="pub-section" id="assets">
          <div className="pub-wrap">
            <h2 className="pub-h2">{t.assets_title}</h2>
            <p className="pub-lead">{t.assets_sub}</p>
            <div className="asset-grid">
              {ASSET_TYPES.map((a) => (
                <div className="asset-chip" key={a.code}>
                  <div className="pub-icon"><Icon name={a.icon} size={18} /></div>{a[lang]}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="pub-section alt" id="features">
          <div className="pub-wrap">
            <h2 className="pub-h2">{t.feat_title}</h2>
            <div className="pub-grid-3">
              {t.feats.map(([icon, title, text]) => (
                <div className="pub-tile" key={title}>
                  <div className="pub-icon"><Icon name={icon} size={20} /></div>
                  <h3>{title}</h3><p>{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="pub-section" id="how">
          <div className="pub-wrap">
            <h2 className="pub-h2">{t.how_title}</h2>
            <div className="pub-grid-3 steps">
              {t.how.map(([title, text], i) => (
                <div className="pub-tile" key={title}>
                  <div className="step-num">{i + 1}</div>
                  <h3>{title}</h3><p>{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="pub-section alt" id="pricing">
          <div className="pub-wrap">
            <h2 className="pub-h2">{t.pricing_title}</h2>
            <p className="pub-lead">{t.pricing_sub}</p>
            <div className="pub-grid-4">
              {PLANS.map((p) => {
                const [name, tag] = t.plan[p.code];
                return (
                  <div className={"pub-tile plan" + (p.code === "PROFESSIONAL" ? " featured" : "")} key={p.code}>
                    <h3 style={{ margin: 0 }}>{name}</h3>
                    <p>{tag}</p>
                    <div className="plan-price">{p.code === "TRIAL" ? t.price_free : t.price_contact}</div>
                    <ul>
                      {p.users ? (
                        <>
                          <li><Icon name="Users" size={15} />{p.users} {t.users}</li>
                          <li><Icon name="Boxes" size={15} />{p.assets.toLocaleString(lang)} {t.assets}</li>
                        </>
                      ) : (
                        <li><Icon name="Infinity" size={15} />{t.unlimited}</li>
                      )}
                    </ul>
                    <Link href={`/signup?plan=${p.code}`} className={"btn" + (p.code === "PROFESSIONAL" ? " btn-primary" : "")}>{t.choose}</Link>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="pub-section" id="faq">
          <div className="pub-wrap">
            <h2 className="pub-h2">{t.faq_title}</h2>
            <div className="faq">
              {t.faq.map(([q, a]) => (
                <details key={q}><summary>{q}</summary><p>{a}</p></details>
              ))}
            </div>
          </div>
        </section>

        {/* Final call to action */}
        <section className="cta">
          <div className="pub-wrap">
            <h2 className="pub-h2">{t.cta_title}</h2>
            <p className="pub-lead" style={{ margin: "0 auto" }}>{t.cta_sub}</p>
            <div className="hero-actions">
              <Link href="/signup" className="btn btn-primary btn-lg">{t.start_trial}<Icon name="ArrowRight" size={16} /></Link>
              <Link href="/login" className="btn btn-lg">{t.sign_in}</Link>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter text={t.footer} />
    </div>
  );
}
