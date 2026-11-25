"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Alert, Loading } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/lib/icons";

type Cls = { id: string; name: string; criticality: string; standardCode: string; expectedLifespanYears: number; pmTemplates: number; spareParts: number; failureModes: number; components: string[] };
type Sys = { id: string; code: string; name: string; assetClasses: Cls[] };
type Sector = { id: string; code: string; name: string; systems: Sys[] };
type State = {
  step: string; completed: boolean; companyName: string; country: string; timeZone: string; currency: string; language: string;
  sector: string | null; sites: { id: string; code: string; name: string; city: string | null }[]; assetClasses: string[];
  added?: { assetClasses: number; checklists: number; failureCodes: number; spareParts: number };
};
type ClassDetail = Cls & { pmProgramme: { id: string; title: string; level: string; trigger: string; interval: number; craft: string | null; regulatory: boolean }[]; parts: { sku: string; name: string }[] };

const STEPS = ["COMPANY", "SITES", "ASSETS", "DONE"] as const;
const CURRENCIES = ["XAF", "XOF", "NGN", "GHS", "KES", "RWF", "CDF", "ZAR", "EUR", "GBP", "USD", "CAD"];

const T = {
  EN: {
    title: "Set up your workspace", sub: "Four short steps. You can change everything later in Settings.",
    steps: ["Company", "Sites", "Equipment", "Ready"], next: "Save and continue", back: "Back", skip: "Skip for now", saving: "Saving…",
    company: "Your company", companySub: "Tell us who you are so the platform speaks your language and currency.",
    companyName: "Company name", sector: "Your sector", currency: "Currency", timeZone: "Time zone", language: "Default language", other: "Another sector",
    sites: "Your sites", sitesSub: "Add the places where your equipment is: a hospital, a plant, a depot, a building…",
    siteName: "Site name", city: "City", addSite: "Add another site", existing: "Sites already in your workspace",
    assets: "Your equipment", assetsSub: "Tick the kinds of equipment you maintain. Each one comes with ready-made maintenance plans, checklists, failure codes and spare parts from the OPES catalog.",
    search: "Search equipment…", selected: "selected", already: "already in your workspace", pm: "maintenance plans", parts: "spare parts", modes: "failure modes",
    details: "What's included", hide: "Hide", allSectors: "Other sectors", years: "years",
    doneTitle: "Your workspace is ready", doneSub: "Here is what we prepared for you.",
    addedClasses: "equipment types", addedChecklists: "checklists", addedCodes: "failure codes", addedParts: "spare parts",
    firstAsset: "Register your first asset", dashboard: "Go to the dashboard",
    tip: "When you register an asset and choose its equipment type, its preventive maintenance plans are created for you as drafts — a planner approves them on the PM board.",
    notAllowed: "Only an administrator or a maintenance manager can set up the workspace.",
    criticality: { CRITICAL: "Critical", HIGH: "High" } as Record<string, string>,
    trigger: (t: string, n: number) => t === "ENGINE_HOURS" ? `every ${n} engine hours` : t === "KILOMETERS" ? `every ${n.toLocaleString("en")} km` : `every ${n} days`,
  },
  FR: {
    title: "Configurez votre espace", sub: "Quatre étapes courtes. Tout reste modifiable ensuite dans les Paramètres.",
    steps: ["Entreprise", "Sites", "Équipements", "Prêt"], next: "Enregistrer et continuer", back: "Retour", skip: "Passer pour l'instant", saving: "Enregistrement…",
    company: "Votre entreprise", companySub: "Présentez-vous pour que la plateforme parle votre langue et votre devise.",
    companyName: "Nom de l'entreprise", sector: "Votre secteur", currency: "Devise", timeZone: "Fuseau horaire", language: "Langue par défaut", other: "Autre secteur",
    sites: "Vos sites", sitesSub: "Ajoutez les lieux où se trouvent vos équipements : hôpital, usine, dépôt, bâtiment…",
    siteName: "Nom du site", city: "Ville", addSite: "Ajouter un autre site", existing: "Sites déjà dans votre espace",
    assets: "Vos équipements", assetsSub: "Cochez les types d'équipements que vous maintenez. Chacun arrive avec des plans de maintenance, check-lists, codes de défaillance et pièces de rechange prêts à l'emploi, issus du catalogue OPES.",
    search: "Rechercher un équipement…", selected: "sélectionné(s)", already: "déjà dans votre espace", pm: "plans de maintenance", parts: "pièces", modes: "modes de défaillance",
    details: "Contenu inclus", hide: "Masquer", allSectors: "Autres secteurs", years: "ans",
    doneTitle: "Votre espace est prêt", doneSub: "Voici ce que nous avons préparé pour vous.",
    addedClasses: "types d'équipements", addedChecklists: "check-lists", addedCodes: "codes de défaillance", addedParts: "pièces de rechange",
    firstAsset: "Enregistrer votre premier équipement", dashboard: "Aller au tableau de bord",
    tip: "Quand vous enregistrez un équipement en choisissant son type, ses plans de maintenance préventive sont créés automatiquement en brouillon — un planificateur les approuve sur le tableau MP.",
    notAllowed: "Seul un administrateur ou un responsable maintenance peut configurer l'espace.",
    criticality: { CRITICAL: "Critique", HIGH: "Élevée" } as Record<string, string>,
    trigger: (t: string, n: number) => t === "ENGINE_HOURS" ? `toutes les ${n} heures moteur` : t === "KILOMETERS" ? `tous les ${n.toLocaleString("fr")} km` : `tous les ${n} jours`,
  },
};

export function OnboardingWizard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const L = user?.language === "FR" ? "FR" : "EN";
  const t = T[L];
  const [state, setState] = useState<State | null>(null);
  const [catalog, setCatalog] = useState<Sector[] | null>(null);
  const [step, setStep] = useState<(typeof STEPS)[number]>("COMPANY");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login?next=/onboarding"); return; }
    Promise.all([api<State>("/onboarding"), api<{ sectors: Sector[] }>(`/catalog?lang=${L}`)])
      .then(([s, c]) => {
        setState(s);
        setCatalog(c.sectors);
        setStep(s.completed ? "ASSETS" : (STEPS.includes(s.step as never) ? s.step : "COMPANY") as (typeof STEPS)[number]);
      })
      .catch((e) => setError((e as Error).message));
  }, [loading, user, router, L]);

  const canEdit = user && (user.role === "ADMIN" || user.role === "MANAGER");

  const run = async (fn: () => Promise<State>, next?: (typeof STEPS)[number]) => {
    setBusy(true);
    setError(null);
    try {
      const s = await fn();
      setState(s);
      if (next) { setStep(next); window.scrollTo({ top: 0 }); }
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  if (!state || !catalog) return <div className="ob"><div className="ob-wrap">{error ? <Alert tone="danger">{error}</Alert> : <Loading />}</div></div>;

  const idx = STEPS.indexOf(step);
  return (
    <div className="ob">
      <header className="ob-head">
        <div className="ob-wrap ob-head-row">
          <div className="row" style={{ flexWrap: "nowrap" }}><div className="brand-mark">OM</div><b>OPES Maintain</b></div>
          <ol className="ob-steps" aria-label={t.title}>
            {t.steps.map((s, i) => (
              <li key={s} className={i < idx ? "done" : i === idx ? "current" : ""} aria-current={i === idx ? "step" : undefined}>
                <span>{i < idx ? <Icon name="Check" size={14} /> : i + 1}</span>{s}
              </li>
            ))}
          </ol>
        </div>
      </header>
      <main id="main" className="ob-wrap ob-main">
        {!canEdit && <Alert tone="warn">{t.notAllowed}</Alert>}
        {error && <Alert tone="danger">{error}</Alert>}
        {step === "COMPANY" && <CompanyStep t={t} state={state} sectors={catalog} busy={busy || !canEdit}
          onSave={(body) => run(() => api<State>("/onboarding/company", { method: "PUT", body }), "SITES")} />}
        {step === "SITES" && <SitesStep t={t} state={state} busy={busy || !canEdit} onBack={() => setStep("COMPANY")}
          onSkip={() => setStep("ASSETS")}
          onSave={(sites) => run(() => api<State>("/onboarding/sites", { body: { sites } }), "ASSETS")} />}
        {step === "ASSETS" && <AssetsStep t={t} L={L} state={state} sectors={catalog} busy={busy || !canEdit} onBack={() => setStep("SITES")}
          onSave={(ids) => run(async () => {
            const s = await api<State>("/onboarding/asset-classes", { method: "PUT", body: { assetClasses: ids } });
            const done = await api<State>("/onboarding/complete", { body: {} });
            return { ...done, added: s.added };
          }, "DONE")} />}
        {step === "DONE" && <DoneStep t={t} state={state} />}
      </main>
    </div>
  );
}

function CompanyStep({ t, state, sectors, busy, onSave }: { t: (typeof T)["EN"]; state: State; sectors: Sector[]; busy: boolean; onSave: (b: Record<string, string>) => void }) {
  const [f, setF] = useState({ companyName: state.companyName ?? "", sector: state.sector ?? "", currency: state.currency ?? "XAF", timeZone: state.timeZone ?? "Africa/Douala", language: state.language ?? "EN" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((v) => ({ ...v, [k]: e.target.value }));
  return (
    <section className="card ob-card">
      <div className="card-body stack">
        <div><h1>{t.company}</h1><p className="muted">{t.companySub}</p></div>
        <div className="field"><label htmlFor="ob-name">{t.companyName}</label><input id="ob-name" className="input" value={f.companyName} onChange={set("companyName")} maxLength={160} /></div>
        <fieldset className="ob-sectors">
          <legend>{t.sector}</legend>
          {[...sectors.map((s) => [s.code, s.name]), ["OTHER", t.other]].map(([code, name]) => (
            <label key={code} className={"ob-sector" + (f.sector === code ? " on" : "")}>
              <input type="radio" name="sector" value={code} checked={f.sector === code} onChange={set("sector")} />
              <Icon name={SECTOR_ICON[code] ?? "Wrench"} size={22} /><span>{name}</span>
            </label>
          ))}
        </fieldset>
        <div className="form-grid">
          <div className="field"><label htmlFor="ob-cur">{t.currency}</label><select id="ob-cur" className="select" value={f.currency} onChange={set("currency")}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="field"><label htmlFor="ob-tz">{t.timeZone}</label><input id="ob-tz" className="input" value={f.timeZone} onChange={set("timeZone")} list="ob-zones" /></div>
          <div className="field"><label htmlFor="ob-lang">{t.language}</label><select id="ob-lang" className="select" value={f.language} onChange={set("language")}><option value="EN">English</option><option value="FR">Français</option></select></div>
        </div>
        <datalist id="ob-zones">{["Africa/Douala", "Africa/Libreville", "Africa/Brazzaville", "Africa/Ndjamena", "Africa/Bangui", "Africa/Malabo", "Africa/Kinshasa", "Africa/Lagos", "Africa/Accra", "Africa/Abidjan", "Africa/Dakar", "Africa/Nairobi", "Africa/Kigali", "Africa/Johannesburg", "Europe/Paris", "Europe/London", "UTC"].map((z) => <option key={z} value={z} />)}</datalist>
      </div>
      <div className="card-foot"><span /><button className="btn btn-primary" disabled={busy || !f.sector || f.companyName.trim().length < 2} onClick={() => onSave(f)}>{busy ? t.saving : t.next}<Icon name="ArrowRight" size={16} /></button></div>
    </section>
  );
}

const SECTOR_ICON: Record<string, string> = {
  HEALTHCARE_BIOMEDICAL: "Stethoscope", TELECOM_TOWERS: "RadioTower", MANUFACTURING_AGRO: "Factory", FLEET_LOGISTICS: "Truck", FACILITIES_PUBLIC: "Building2", OTHER: "Wrench",
};

function SitesStep({ t, state, busy, onSave, onBack, onSkip }: { t: (typeof T)["EN"]; state: State; busy: boolean; onSave: (s: { name: string; city: string }[]) => void; onBack: () => void; onSkip: () => void }) {
  const [rows, setRows] = useState([{ name: "", city: "" }]);
  const valid = rows.filter((r) => r.name.trim().length >= 2);
  return (
    <section className="card ob-card">
      <div className="card-body stack">
        <div><h1>{t.sites}</h1><p className="muted">{t.sitesSub}</p></div>
        {state.sites.length > 0 && (
          <div><div className="small muted" style={{ marginBottom: 6 }}>{t.existing}</div>
            <ul className="ob-chips">{state.sites.map((s) => <li key={s.id}><Icon name="MapPin" size={14} />{s.name}{s.city ? ` · ${s.city}` : ""}</li>)}</ul></div>
        )}
        {rows.map((r, i) => (
          <div className="form-grid" key={i}>
            <div className="field"><label htmlFor={`site-${i}`}>{t.siteName}</label><input id={`site-${i}`} className="input" value={r.name} maxLength={160} onChange={(e) => setRows((x) => x.map((y, j) => j === i ? { ...y, name: e.target.value } : y))} /></div>
            <div className="field"><label htmlFor={`city-${i}`}>{t.city}</label><input id={`city-${i}`} className="input" value={r.city} maxLength={120} onChange={(e) => setRows((x) => x.map((y, j) => j === i ? { ...y, city: e.target.value } : y))} /></div>
          </div>
        ))}
        <button type="button" className="btn" style={{ alignSelf: "flex-start" }} onClick={() => setRows((x) => [...x, { name: "", city: "" }])}><Icon name="Plus" size={16} />{t.addSite}</button>
      </div>
      <div className="card-foot">
        <button className="btn btn-ghost" onClick={onBack}><Icon name="ArrowLeft" size={16} />{t.back}</button>
        <div className="row">
          {state.sites.length > 0 && <button className="btn" onClick={onSkip}>{t.skip}</button>}
          <button className="btn btn-primary" disabled={busy || valid.length === 0} onClick={() => onSave(valid)}>{busy ? t.saving : t.next}<Icon name="ArrowRight" size={16} /></button>
        </div>
      </div>
    </section>
  );
}

function AssetsStep({ t, L, state, sectors, busy, onSave, onBack }: { t: (typeof T)["EN"]; L: "EN" | "FR"; state: State; sectors: Sector[]; busy: boolean; onSave: (ids: string[]) => void; onBack: () => void }) {
  const owned = useMemo(() => new Set(state.assetClasses), [state.assetClasses]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(state.assetClasses));
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, ClassDetail>>({});
  const ordered = [...sectors].sort((a, b) => (a.code === state.sector ? -1 : b.code === state.sector ? 1 : 0));
  const needle = q.trim().toLowerCase();
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) { if (!owned.has(id)) n.delete(id); } else n.add(id); return n; });
  const show = async (id: string) => {
    setOpen(open === id ? null : id);
    if (!detail[id]) {
      try { const d = await api<ClassDetail>(`/catalog/classes/${id}?lang=${L}`); setDetail((x) => ({ ...x, [id]: d })); } catch { /* preview is optional */ }
    }
  };
  return (
    <section className="card ob-card">
      <div className="card-body stack">
        <div><h1>{t.assets}</h1><p className="muted">{t.assetsSub}</p></div>
        <div className="ob-toolbar">
          <div className="ob-search"><Icon name="Search" size={16} /><input className="input" placeholder={t.search} aria-label={t.search} value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <span className="badge">{picked.size} {t.selected}</span>
        </div>
        {ordered.map((s, si) => {
          const systems = s.systems.map((y) => ({ ...y, assetClasses: y.assetClasses.filter((c) => !needle || c.name.toLowerCase().includes(needle) || y.name.toLowerCase().includes(needle)) })).filter((y) => y.assetClasses.length);
          if (!systems.length) return null;
          return (
            <details key={s.id} className="ob-sector-group" open={si === 0 || !!needle || systems.some((y) => y.assetClasses.some((c) => picked.has(c.id)))}>
              <summary><Icon name={SECTOR_ICON[s.code] ?? "Wrench"} size={18} /><b>{s.name}</b><span className="muted small">{systems.reduce((a, y) => a + y.assetClasses.filter((c) => picked.has(c.id)).length, 0)} / {systems.reduce((a, y) => a + y.assetClasses.length, 0)}</span></summary>
              {systems.map((y) => (
                <div key={y.id} className="ob-system">
                  <h3>{y.name}</h3>
                  <ul className="ob-classes">
                    {y.assetClasses.map((c) => (
                      <li key={c.id} className={picked.has(c.id) ? "on" : ""}>
                        <label>
                          <input type="checkbox" checked={picked.has(c.id)} disabled={owned.has(c.id)} onChange={() => toggle(c.id)} />
                          <span className="ob-class-name">{c.name}</span>
                          <span className={"badge " + (c.criticality === "CRITICAL" ? "tone-danger" : "tone-warn")}>{t.criticality[c.criticality] ?? c.criticality}</span>
                        </label>
                        <div className="ob-class-meta">
                          <span>{c.pmTemplates} {t.pm}</span>{c.spareParts > 0 && <span>{c.spareParts} {t.parts}</span>}{c.failureModes > 0 && <span>{c.failureModes} {t.modes}</span>}
                          {c.expectedLifespanYears > 0 && <span>{c.expectedLifespanYears} {t.years}</span>}
                          {owned.has(c.id) && <span className="ob-owned">{t.already}</span>}
                          <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open === c.id} onClick={() => show(c.id)}>{open === c.id ? t.hide : t.details}</button>
                        </div>
                        {open === c.id && detail[c.id] && (
                          <div className="ob-detail">
                            <ul>{detail[c.id].pmProgramme.map((p) => <li key={p.id}><b>{p.title}</b> — {t.trigger(p.trigger, p.interval)}{p.craft ? ` · ${p.craft}` : ""}{p.regulatory ? " · ⚖" : ""}</li>)}</ul>
                            {detail[c.id].parts.length > 0 && <p className="small muted">{detail[c.id].parts.map((p) => p.name).join(" · ")}</p>}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </details>
          );
        })}
      </div>
      <div className="card-foot">
        <button className="btn btn-ghost" onClick={onBack}><Icon name="ArrowLeft" size={16} />{t.back}</button>
        <button className="btn btn-primary" disabled={busy} onClick={() => onSave([...picked])}>{busy ? t.saving : t.next}<Icon name="ArrowRight" size={16} /></button>
      </div>
    </section>
  );
}

function DoneStep({ t, state }: { t: (typeof T)["EN"]; state: State }) {
  const a = state.added;
  return (
    <section className="card ob-card">
      <div className="card-body stack" style={{ alignItems: "flex-start" }}>
        <div className="ob-done-icon"><Icon name="CircleCheck" size={30} /></div>
        <div><h1>{t.doneTitle}</h1><p className="muted">{t.doneSub}</p></div>
        <div className="ob-stats">
          <div><b>{state.assetClasses.length}</b><span>{t.addedClasses}</span></div>
          <div><b>{a?.checklists ?? "—"}</b><span>{t.addedChecklists}</span></div>
          <div><b>{a?.failureCodes ?? "—"}</b><span>{t.addedCodes}</span></div>
          <div><b>{a?.spareParts ?? "—"}</b><span>{t.addedParts}</span></div>
        </div>
        <Alert tone="info">{t.tip}</Alert>
        <div className="row">
          <Link href="/m/assets/new" className="btn btn-primary"><Icon name="Plus" size={16} />{t.firstAsset}</Link>
          <Link href="/dashboard" className="btn">{t.dashboard}</Link>
        </div>
      </div>
    </section>
  );
}
