import Link from "next/link";
import { Icon } from "@/lib/icons";
import { C, SITE, href, type Lang, type Page } from "@/lib/site/content";
import { siteJsonLd } from "@/lib/site/seo";
import { MoneyProvider } from "./Money";
import { AccountButtons, LangLink, LanguageRedirect } from "./AccountButtons";

const NAV: Page[] = ["features", "industries", "pricing", "licensing", "about", "contact"];

export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

function Brand({ lang }: { lang: Lang }) {
  return (
    <Link href={href(lang, "")} className="site-brand" aria-label={`${SITE.name} — ${C[lang].common.home}`}>
      <span className="site-mark" aria-hidden="true">OM</span>
      <span className="site-brand-text"><b>OPES</b> Maintain</span>
    </Link>
  );
}

export function SiteHeader({ lang, page }: { lang: Lang; page: Page | "signup" }) {
  const t = C[lang];
  const other: Lang = lang === "fr" ? "en" : "fr";
  const otherHref = page === "signup" ? `/signup?lang=${other}` : href(other, page);
  return (
    <header className="site-head">
      <div className="site-wrap site-head-row">
        <Brand lang={lang} />
        <nav className="site-nav" aria-label={lang === "fr" ? "Navigation principale" : "Main navigation"}>
          {NAV.map((p) => (
            <Link key={p} href={href(lang, p)} aria-current={page === p ? "page" : undefined}>{t.nav[p as keyof typeof t.nav]}</Link>
          ))}
        </nav>
        <div className="site-actions">
          <LangLink href={otherHref} lang={other} className="site-lang" label={other === "fr" ? "Version française" : "English version"}>{other.toUpperCase()}</LangLink>
          <AccountButtons signIn={t.signIn} startTrial={t.startTrial} openApp={t.openApp} lang={lang} />
          <details className="site-menu">
            <summary aria-label={t.menu}><Icon name="Menu" size={22} /></summary>
            <div className="site-menu-panel">
              {NAV.map((p) => <Link key={p} href={href(lang, p)} aria-current={page === p ? "page" : undefined}>{t.nav[p as keyof typeof t.nav]}</Link>)}
              <Link href="/login">{t.signIn}</Link>
              <Link href={`/signup${lang === "fr" ? "?lang=fr" : ""}`} className="site-btn site-btn-primary">{t.startTrial}</Link>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ lang, page = "" }: { lang: Lang; page?: Page }) {
  const t = C[lang];
  return (
    <footer className="site-foot">
      <div className="site-wrap site-foot-grid">
        <div className="site-foot-brand">
          <Brand lang={lang} />
          <p>{t.footer.tagline}</p>
          <p className="site-foot-addr"><Icon name="MapPin" size={15} /> {SITE.company} · {t.contact.officeText}</p>
        </div>
        <div>
          <h2>{t.footer.product}</h2>
          <Link href={href(lang, "features")}>{t.nav.features}</Link>
          <Link href={href(lang, "industries")}>{t.nav.industries}</Link>
          <Link href={href(lang, "pricing")}>{t.nav.pricing}</Link>
          <Link href={href(lang, "licensing")}>{t.nav.licensing}</Link>
        </div>
        <div>
          <h2>{t.footer.company}</h2>
          <Link href={href(lang, "about")}>{t.nav.about}</Link>
          <Link href={href(lang, "contact")}>{t.nav.contact}</Link>
          <Link href="/login">{t.signIn}</Link>
          <Link href={`/signup${lang === "fr" ? "?lang=fr" : ""}`}>{t.footer.signup}</Link>
        </div>
        <div>
          <h2>{t.footer.legal}</h2>
          <Link href={href(lang, "privacy")}>{t.footer.privacy}</Link>
          <Link href={href(lang, "terms")}>{t.footer.terms}</Link>
          <LangLink href={href(lang === "fr" ? "en" : "fr", page)} lang={lang === "fr" ? "en" : "fr"} label={lang === "fr" ? "English" : "Français"}>{lang === "fr" ? "English" : "Français"}</LangLink>
        </div>
      </div>
      <div className="site-wrap site-foot-base">
        <span>© {new Date().getFullYear()} {SITE.company}. {t.footer.rights}</span>
        <span>{lang === "fr" ? "Développé par" : "Developed by"} <a href={SITE.companyUrl} rel="author">Opesware Technologies</a> · <a href={SITE.companyUrl}>opesware.com</a></span>
      </div>
    </footer>
  );
}

/** Wraps every public page: header, footer, currency context and site-wide structured data. */
export function SiteShell({ lang, page, children }: { lang: Lang; page: Page; children: React.ReactNode }) {
  return (
    <MoneyProvider>
      <div className="site" lang={lang}>
        <LanguageRedirect lang={lang} page={page} />
        <JsonLd data={siteJsonLd(lang)} />
        <SiteHeader lang={lang} page={page} />
        <main id="main">{children}</main>
        <SiteFooter lang={lang} page={page} />
      </div>
    </MoneyProvider>
  );
}
