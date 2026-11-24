"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/lib/icons";
import { COUNTRIES, INDUSTRIES, PLANS, dict, usePublicLang, type Lang } from "@/lib/public-i18n";
import { PublicHeader } from "./PublicChrome";

const S = {
  en: {
    title: "Create your company account", sub: "Free for 30 days. No card required.",
    fullName: "Your full name", email: "Work e-mail", company: "Company name", country: "Country", phone: "Phone (optional)",
    industry: "Industry", choose: "Choose…", plan: "Plan", password: "Password", passwordHint: "At least 10 characters, with letters and digits.",
    confirm: "Confirm password", mismatch: "The two passwords are different.",
    terms: "By creating an account you agree to use OPES Maintain for your company's legitimate maintenance activities.",
    create: "Create account", creating: "Creating…", have: "Already have an account?",
    verifyTitle: "Check your e-mail", verifySub: (e: string) => `We sent a 6-digit code to ${e}. Enter it below to create your workspace.`,
    code: "Verification code", verify: "Verify and open my workspace", verifying: "Setting up your workspace…",
    resend: "Send a new code", resent: "A new code is on its way.", back: "Change my details", devCode: "Development code:",
    reviewTitle: "Request received", reviewSub: (c: string) => `Thank you. We are setting up the workspace for ${c} and will contact you shortly to activate it.`,
    reviewNext: "Once activated, sign in with your e-mail and the password you just chose.", home: "Back to home",
    sideTitle: "What you get", side: [
      ["ShieldCheck", "A private workspace", "Your users, assets and records are isolated from every other company."],
      ["Boxes", "Your assets, your way", "Medical devices, generators, HVAC, vehicles, production lines — tick what you own."],
      ["CalendarClock", "Preventive maintenance from day one", "Plans that create work orders on time, automatically."],
      ["Smartphone", "Technicians in the field", "Offline mobile app with photos, checklists and signatures."],
    ],
    errors: {
      EMAIL_IN_USE: "An account already exists for this e-mail. Sign in or reset your password.",
      SIGNUP_CODE_INVALID: "The code is not valid. Check the e-mail we sent you.",
      SIGNUP_CODE_EXPIRED: "This code has expired. Request a new one.",
      SIGNUP_TOO_MANY_ATTEMPTS: "Too many wrong codes. Request a new one.",
      SIGNUP_IN_REVIEW: "Your request is being reviewed. We will activate your account shortly.",
      RATE_LIMITED: "Too many attempts. Wait a minute and try again.",
      EMAIL_UNAVAILABLE: "We could not send the e-mail right now. Please try again shortly.",
    } as Record<string, string>,
  },
  fr: {
    title: "Créez le compte de votre entreprise", sub: "Gratuit pendant 30 jours. Sans carte bancaire.",
    fullName: "Votre nom complet", email: "E-mail professionnel", company: "Nom de l'entreprise", country: "Pays", phone: "Téléphone (facultatif)",
    industry: "Secteur", choose: "Choisir…", plan: "Offre", password: "Mot de passe", passwordHint: "Au moins 10 caractères, avec des lettres et des chiffres.",
    confirm: "Confirmez le mot de passe", mismatch: "Les deux mots de passe sont différents.",
    terms: "En créant un compte, vous acceptez d'utiliser OPES Maintain pour les activités de maintenance légitimes de votre entreprise.",
    create: "Créer le compte", creating: "Création…", have: "Vous avez déjà un compte ?",
    verifyTitle: "Vérifiez votre e-mail", verifySub: (e: string) => `Nous avons envoyé un code à 6 chiffres à ${e}. Saisissez-le pour créer votre espace.`,
    code: "Code de vérification", verify: "Vérifier et ouvrir mon espace", verifying: "Préparation de votre espace…",
    resend: "Envoyer un nouveau code", resent: "Un nouveau code est en route.", back: "Modifier mes informations", devCode: "Code de développement :",
    reviewTitle: "Demande reçue", reviewSub: (c: string) => `Merci. Nous préparons l'espace de ${c} et vous contacterons très vite pour l'activer.`,
    reviewNext: "Une fois activé, connectez-vous avec votre e-mail et le mot de passe que vous venez de choisir.", home: "Retour à l'accueil",
    sideTitle: "Ce que vous obtenez", side: [
      ["ShieldCheck", "Un espace privé", "Vos utilisateurs, équipements et dossiers sont isolés de toute autre entreprise."],
      ["Boxes", "Vos équipements, à votre façon", "Dispositifs médicaux, groupes, CVC, véhicules, lignes de production — cochez ce que vous possédez."],
      ["CalendarClock", "Maintenance préventive dès le premier jour", "Des plans qui créent les ordres de travail à temps."],
      ["Smartphone", "Techniciens sur le terrain", "Application mobile hors ligne avec photos, check-lists et signatures."],
    ],
    errors: {
      EMAIL_IN_USE: "Un compte existe déjà pour cet e-mail. Connectez-vous ou réinitialisez votre mot de passe.",
      SIGNUP_CODE_INVALID: "Le code n'est pas valide. Vérifiez l'e-mail reçu.",
      SIGNUP_CODE_EXPIRED: "Ce code a expiré. Demandez-en un nouveau.",
      SIGNUP_TOO_MANY_ATTEMPTS: "Trop de codes erronés. Demandez-en un nouveau.",
      SIGNUP_IN_REVIEW: "Votre demande est en cours d'examen. Nous activerons votre compte très vite.",
      RATE_LIMITED: "Trop de tentatives. Patientez une minute.",
      EMAIL_UNAVAILABLE: "Impossible d'envoyer l'e-mail pour le moment. Réessayez dans quelques instants.",
    } as Record<string, string>,
  },
};

function message(err: unknown, lang: Lang): string {
  const e = err as ApiError;
  return (e?.code && S[lang].errors[e.code]) || e?.message || "Error";
}

export function SignupFlow() {
  const [lang, setLang] = usePublicLang();
  const s = S[lang];
  const t = dict(lang);
  const router = useRouter();
  const sp = useSearchParams();
  const { login } = useAuth();

  const [stage, setStage] = useState<"form" | "code" | "review">("form");
  const [f, setF] = useState({ fullName: "", email: "", companyName: "", country: "CM", phone: "", industry: "", plan: "TRIAL", password: "", confirm: "", website: "" });
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const p = sp.get("plan")?.toUpperCase();
    if (p && PLANS.some((x) => x.code === p)) setF((v) => ({ ...v, plan: p }));
  }, [sp]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((v) => ({ ...v, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (f.password !== f.confirm) { setError(s.mismatch); return; }
    setBusy(true);
    try {
      const { confirm: _confirm, ...body } = f;
      const r = await api<{ devCode?: string; review?: boolean }>("/public/signup", { body: { ...body, language: lang.toUpperCase() } });
      setDevCode(r.devCode ?? null);
      setStage(r.review ? "review" : "code");
    } catch (err) {
      setError(message(err, lang));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api("/public/signup/verify", { body: { email: f.email, code } });
      try {
        const u = await login(f.email.trim().toLowerCase(), f.password);
        router.replace(u.mfaEnrollmentRequired ? "/settings?mfa=1" : "/dashboard");
      } catch {
        router.replace(`/login?email=${encodeURIComponent(f.email.trim().toLowerCase())}`);
      }
    } catch (err) {
      setError(message(err, lang));
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    setNote(null);
    try {
      const r = await api<{ devCode?: string }>("/public/signup/resend", { body: { email: f.email } });
      setDevCode(r.devCode ?? null);
      setNote(s.resent);
    } catch (err) {
      setError(message(err, lang));
    }
  };

  return (
    <div className="pub">
      <PublicHeader lang={lang} setLang={setLang} signIn={t.sign_in} openApp={t.open_app} />
      <main id="main" className="signup">
        <aside className="signup-side">
          <h2 style={{ margin: 0, fontSize: 22 }}>{s.sideTitle}</h2>
          <div className="check-list">
            {s.side.map(([icon, title, text]) => (
              <div key={title}>
                <div className="pub-icon"><Icon name={icon} size={18} /></div>
                <div><strong>{title}</strong><div className="muted" style={{ fontSize: 14, marginTop: 2 }}>{text}</div></div>
              </div>
            ))}
          </div>
        </aside>

        <section className="signup-main">
          <div className="signup-card stack">
            {stage === "review" ? (
              <>
                <div className="pub-icon" style={{ width: 48, height: 48 }}><Icon name="CircleCheck" size={26} /></div>
                <div><h1 style={{ margin: 0 }}>{s.reviewTitle}</h1><p className="muted" style={{ margin: "8px 0 0" }}>{s.reviewSub(f.companyName)}</p></div>
                <Alert tone="info">{s.reviewNext}</Alert>
                <div className="row">
                  <Link href={`/login?email=${encodeURIComponent(f.email.trim().toLowerCase())}`} className="btn btn-primary">{t.sign_in}</Link>
                  <Link href="/" className="btn">{s.home}</Link>
                </div>
              </>
            ) : stage === "form" ? (
              <>
                <div><h1 style={{ margin: 0 }}>{s.title}</h1><p className="muted" style={{ margin: "6px 0 0" }}>{s.sub}</p></div>
                {error && <Alert tone="danger">{error}</Alert>}
                <form className="stack" onSubmit={submit} noValidate={false}>
                  <div className="form-grid">
                    <div className="field pub-span-2"><label htmlFor="fullName">{s.fullName}</label>
                      <input id="fullName" className="input" required minLength={2} maxLength={120} autoComplete="name" value={f.fullName} onChange={set("fullName")} /></div>
                    <div className="field pub-span-2"><label htmlFor="email">{s.email}</label>
                      <input id="email" className="input" type="email" required maxLength={200} autoComplete="email" value={f.email} onChange={set("email")} /></div>
                    <div className="field pub-span-2"><label htmlFor="companyName">{s.company}</label>
                      <input id="companyName" className="input" required minLength={2} maxLength={160} autoComplete="organization" value={f.companyName} onChange={set("companyName")} /></div>
                    <div className="field"><label htmlFor="country">{s.country}</label>
                      <select id="country" className="input" required value={f.country} onChange={set("country")}>
                        {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c[lang]}</option>)}
                      </select></div>
                    <div className="field"><label htmlFor="phone">{s.phone}</label>
                      <input id="phone" className="input" type="tel" maxLength={40} autoComplete="tel" value={f.phone} onChange={set("phone")} /></div>
                    <div className="field"><label htmlFor="industry">{s.industry}</label>
                      <select id="industry" className="input" required value={f.industry} onChange={set("industry")}>
                        <option value="">{s.choose}</option>
                        {INDUSTRIES.map((i) => <option key={i.code} value={i.code}>{i[lang]}</option>)}
                      </select></div>
                    <div className="field"><label htmlFor="plan">{s.plan}</label>
                      <select id="plan" className="input" value={f.plan} onChange={set("plan")}>
                        {PLANS.map((p) => <option key={p.code} value={p.code}>{t.plan[p.code][0]}</option>)}
                      </select></div>
                    <div className="field"><label htmlFor="password">{s.password}</label>
                      <input id="password" className="input" type="password" required minLength={10} autoComplete="new-password" value={f.password} onChange={set("password")} /></div>
                    <div className="field"><label htmlFor="confirm">{s.confirm}</label>
                      <input id="confirm" className="input" type="password" required minLength={10} autoComplete="new-password" value={f.confirm} onChange={set("confirm")} /></div>
                    <div className="pub-span-2 small muted">{s.passwordHint}</div>
                  </div>
                  <div className="hp" aria-hidden="true">
                    <label htmlFor="website">Website</label>
                    <input id="website" tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} />
                  </div>
                  <p className="small muted" style={{ margin: 0 }}>{s.terms}</p>
                  <button className="btn btn-primary big-btn" disabled={busy}>{busy ? s.creating : s.create}</button>
                </form>
                <p className="small muted" style={{ margin: 0 }}>{s.have} <Link href="/login">{t.sign_in}</Link></p>
              </>
            ) : (
              <>
                <div><h1 style={{ margin: 0 }}>{s.verifyTitle}</h1><p className="muted" style={{ margin: "6px 0 0" }}>{s.verifySub(f.email)}</p></div>
                {error && <Alert tone="danger">{error}</Alert>}
                {note && <Alert tone="ok">{note}</Alert>}
                {devCode && <Alert tone="warn">{s.devCode} <strong>{devCode}</strong></Alert>}
                <form className="stack" onSubmit={verify}>
                  <div className="field"><label htmlFor="code">{s.code}</label>
                    <input id="code" className="input code-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus
                      value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></div>
                  <button className="btn btn-primary big-btn" disabled={busy || code.length !== 6}>{busy ? s.verifying : s.verify}</button>
                </form>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setStage("form"); setError(null); setNote(null); }}>{s.back}</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={resend}>{s.resend}</button>
                </div>
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
