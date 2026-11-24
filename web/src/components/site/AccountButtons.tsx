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
