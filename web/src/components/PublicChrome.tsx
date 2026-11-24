"use client";
import Link from "next/link";
import type { Lang } from "@/lib/public-i18n";
import { getToken } from "@/lib/api";
import { useEffect, useState } from "react";

export function LangToggle({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <div className="lang-toggle" role="group" aria-label="Language">
      <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
      <button type="button" aria-pressed={lang === "fr"} onClick={() => setLang("fr")}>FR</button>
    </div>
  );
}

export function PublicHeader({ lang, setLang, nav, signIn, cta, openApp }: {
  lang: Lang; setLang: (l: Lang) => void; nav?: [string, string][]; signIn: string; cta?: string; openApp: string;
}) {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => { setSignedIn(!!getToken()); }, []);
  return (
    <header className="pub-head">
      <div className="pub-wrap">
        <Link href="/" className="pub-brand">
          <div className="brand-mark">OM</div>
          <div><div className="brand-name">OPES Maintain</div><div className="brand-sub">by OPES Health Systems</div></div>
        </Link>
        {nav && <nav className="pub-nav">{nav.map(([href, label]) => <a key={href} href={href}>{label}</a>)}</nav>}
        <div className="pub-head-actions">
          <LangToggle lang={lang} setLang={setLang} />
          {signedIn ? (
            <Link href="/dashboard" className="btn btn-primary">{openApp}</Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost">{signIn}</Link>
              {cta && <Link href="/signup" className="btn btn-primary hide-sm">{cta}</Link>}
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function PublicFooter({ text }: { text: string }) {
  return (
    <footer className="pub-foot">
      <div className="pub-wrap">
        <span>© {new Date().getFullYear()} OPES Maintain · {text}</span>
        <span><Link href="/login">Sign in</Link> · <Link href="/signup">Sign up</Link></span>
      </div>
    </footer>
  );
}
