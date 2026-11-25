"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getToken } from "@/lib/api";

/** "Sign in / Start free trial", or "Open my workspace" when this browser is already signed in. */
export function AccountButtons({ signIn, startTrial, openApp, lang }: { signIn: string; startTrial: string; openApp: string; lang: "en" | "fr" }) {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => { setSignedIn(!!getToken()); }, []);
  if (signedIn) return <Link href="/dashboard" className="site-btn site-btn-primary site-hide-sm">{openApp}</Link>;
  return (
    <>
      <Link href="/login" className="site-btn site-btn-ghost site-hide-sm">{signIn}</Link>
      <Link href={`/signup${lang === "fr" ? "?lang=fr" : ""}`} className="site-btn site-btn-primary site-hide-xs">{startTrial}</Link>
    </>
  );
}

const LANG_KEY = "opes.publicLang";

/** Records an explicit language choice so automatic detection never overrides it. */
export function rememberLang(l: "en" | "fr") {
  try { window.localStorage.setItem(LANG_KEY, l); } catch { /* storage blocked */ }
}

/** Language switch link that also remembers the visitor's choice. */
export function LangLink({ href, lang, label, className, children }: { href: string; lang: "en" | "fr"; label: string; className?: string; children: React.ReactNode }) {
  return <Link href={href} hrefLang={lang} className={className} aria-label={label} onClick={() => rememberLang(lang)}>{children}</Link>;
}

/**
 * Sends a visitor to the page in their language: their saved choice first, otherwise the browser language.
 * Runs once per browser session, never for crawlers (so both language versions stay indexable).
 */
export function LanguageRedirect({ lang, page }: { lang: "en" | "fr"; page: string }) {
  useEffect(() => {
    try {
      if (/bot|crawl|spider|slurp|preview|lighthouse/i.test(navigator.userAgent) || navigator.webdriver) return;
      const saved = window.localStorage.getItem(LANG_KEY);
      let want: "en" | "fr" | null = saved === "en" || saved === "fr" ? saved : null;
      if (!want) {
        if (window.sessionStorage.getItem("opes.langChecked")) return;
        window.sessionStorage.setItem("opes.langChecked", "1");
        want = (navigator.languages?.[0] ?? navigator.language ?? "en").toLowerCase().startsWith("fr") ? "fr" : "en";
      }
      if (want !== lang) {
        const path = want === "fr" ? (page ? `/fr/${page}` : "/fr") : (page ? `/${page}` : "/");
        window.location.replace(path + window.location.search);
      }
    } catch { /* storage blocked: stay on this page */ }
  }, [lang, page]);
  return null;
}
