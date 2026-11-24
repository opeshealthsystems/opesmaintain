"use client";
import { useEffect, useState } from "react";
import { Icon } from "@/lib/icons";
import { COUNTRIES } from "@/lib/public-i18n";

type F = { name: string; email: string; phone: string; company: string; country: string; topic: string; message: string };

export function ContactForm({ lang, t, topics }: {
  lang: "en" | "fr";
  t: { name: string; email: string; phone: string; company: string; country: string; topic: string; message: string; send: string; sending: string; sent: string; error: string };
  topics: string[][];
}) {
  const [f, setF] = useState<F & { website: string }>({ name: "", email: "", phone: "", company: "", country: "CM", topic: "DEMO", message: "", website: "" });
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("topic")?.toUpperCase();
    if (q && topics.some(([c]) => c === q)) setF((v) => ({ ...v, topic: q }));
  }, [topics]);
  const set = (k: keyof F) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((v) => ({ ...v, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("busy");
    setErr(null);
    try {
      const r = await fetch("/api/v1/public/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, language: lang.toUpperCase() }) });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        setErr(j?.detail ?? null);
        setState("error");
        return;
      }
      setState("sent");
    } catch {
      setState("error");
    }
  };

  if (state === "sent") {
    return <div className="form-done" role="status"><Icon name="CircleCheck" size={28} /><p>{t.sent}</p></div>;
  }
  return (
    <form className="site-form" onSubmit={submit}>
      <div className="site-form-grid">
        <label>{t.name}<input required minLength={2} maxLength={120} autoComplete="name" value={f.name} onChange={set("name")} /></label>
        <label>{t.email}<input type="email" required maxLength={200} autoComplete="email" value={f.email} onChange={set("email")} /></label>
        <label>{t.phone}<input type="tel" maxLength={40} autoComplete="tel" value={f.phone} onChange={set("phone")} /></label>
        <label>{t.company}<input maxLength={160} autoComplete="organization" value={f.company} onChange={set("company")} /></label>
        <label>{t.country}<select value={f.country} onChange={set("country")}>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c[lang]}</option>)}</select></label>
        <label>{t.topic}<select value={f.topic} onChange={set("topic")}>{topics.map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select></label>
        <label className="span-all">{t.message}<textarea required minLength={10} maxLength={5000} rows={6} value={f.message} onChange={set("message")} /></label>
      </div>
      <div className="hp" aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF((v) => ({ ...v, website: e.target.value }))} /></label></div>
      {state === "error" && <p className="form-error" role="alert">{err ?? t.error}</p>}
      <button className="site-btn site-btn-primary site-btn-lg" disabled={state === "busy"}>{state === "busy" ? t.sending : t.send}</button>
    </form>
  );
}
