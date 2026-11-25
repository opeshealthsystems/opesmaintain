"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Alert, Loading } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/lib/icons";

type Overview = Record<string, number>;
type Company = {
  id: string; code: string; name: string; status: string; plan: string; country: string; currency: string; industry: string | null;
  users: number; assets: number; workOrders: number; maxUsers: number | null; maxAssets: number | null; trialEndsAt: string | null;
  createdAt: string | null; lastLoginAt: string | null; setupComplete: boolean; sites?: number; pmPlans?: number;
  administrators?: { fullName: string; email: string; role: string; phone: string | null; status: string; lastLoginAt: string | null }[];
};
type Signup = { email: string; fullName: string; company: string; country: string; phone: string | null; industry: string | null; createdAt: string };
type Message = { createdAt: string; status: string; topic: string; name: string; email: string; phone: string | null; company: string | null; country: string | null; language: string; message: string };

const TABS = [["overview", "Overview", "LayoutDashboard"], ["companies", "Companies", "Building2"], ["signups", "Sign-ups", "UserPlus"], ["messages", "Messages", "Mail"]] as const;
const STATUS_TONE: Record<string, string> = { ACTIVE: "tone-ok", TRIAL: "tone-info", TRIAL_EXPIRED: "tone-warn", SUSPENDED: "tone-danger" };
const day = (s: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—");
const ago = (s: string | null) => {
  if (!s) return "never";
  const d = Math.round((Date.now() - new Date(s).getTime()) / 86400000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};

export function PlatformConsole() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("overview");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login?next=/platform");
  }, [loading, user, router]);

  if (loading || !user) return <div className="pc"><Loading /></div>;
  if (!user.platformOperator) {
    return (
      <div className="pc"><div className="pc-wrap" style={{ paddingTop: 64 }}>
        <div className="card"><div className="card-body stack"><h1 style={{ margin: 0 }}>Page not found</h1><Link className="btn" href="/dashboard">Back to dashboard</Link></div></div>
      </div></div>
    );
  }
  return (
    <div className="pc">
      <header className="pc-head">
        <div className="pc-wrap pc-head-row">
          <div className="row" style={{ flexWrap: "nowrap" }}><div className="brand-mark">OM</div><div><b>OPES Maintain</b><div className="small muted">Operator console · Opesware Technologies</div></div></div>
          <nav className="pc-tabs" aria-label="Console sections">
            {TABS.map(([k, label, icon]) => (
              <button key={k} type="button" aria-current={tab === k ? "page" : undefined} onClick={() => { setTab(k); setError(null); }}><Icon name={icon} size={16} />{label}</button>
            ))}
          </nav>
          <div className="row"><span className="small muted">{user.email}</span><button className="btn btn-sm" onClick={logout}><Icon name="LogOut" size={14} />Sign out</button></div>
        </div>
      </header>
      <main id="main" className="pc-wrap pc-main">
        {error && <Alert tone="danger">{error}</Alert>}
        {tab === "overview" && <OverviewTab onError={setError} onOpen={setTab} />}
        {tab === "companies" && <CompaniesTab onError={setError} />}
        {tab === "signups" && <SignupsTab onError={setError} />}
        {tab === "messages" && <MessagesTab onError={setError} />}
      </main>
    </div>
  );
}

function OverviewTab({ onError, onOpen }: { onError: (e: string) => void; onOpen: (t: "companies" | "signups" | "messages") => void }) {
  const [o, setO] = useState<Overview | null>(null);
  useEffect(() => { api<Overview>("/platform/overview").then(setO).catch((e) => onError((e as Error).message)); }, [onError]);
  if (!o) return <Loading />;
  const tiles: [string, number, string, (() => void) | null][] = [
    ["Companies", o.companies, "Building2", () => onOpen("companies")], ["Active", o.active, "CircleCheck", null],
    ["On trial", o.onTrial, "Hourglass", null], ["Trials ending in 7 days", o.trialsEndingIn7Days, "AlarmClock", null],
    ["Expired trials", o.trialsExpired, "TriangleAlert", null], ["Suspended", o.suspended, "Ban", null],
    ["New in 7 days", o.newLast7Days, "TrendingUp", null], ["New in 30 days", o.newLast30Days, "CalendarRange", null],
    ["Setup not finished", o.setupIncomplete, "ListTodo", null], ["Users", o.users, "Users", null], ["Assets", o.assets, "Boxes", null],
    ["Sign-ups waiting", o.pendingSignups, "UserPlus", () => onOpen("signups")], ["New messages", o.newMessages, "Mail", () => onOpen("messages")],
  ];
  return (
    <div className="pc-tiles">
      {tiles.map(([label, value, icon, go]) => {
        const body = <><Icon name={icon} size={18} /><b>{value ?? 0}</b><span>{label}</span></>;
        return go ? <button key={label} type="button" className="pc-tile pc-tile-link" onClick={go}>{body}</button> : <div key={label} className="pc-tile">{body}</div>;
      })}
    </div>
  );
}

function CompaniesTab({ onError }: { onError: (e: string) => void }) {
  const [rows, setRows] = useState<Company[] | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<Company | null>(null);
  const load = useCallback(() => {
    api<Company[]>(`/platform/companies?q=${encodeURIComponent(q)}&status=${status}`).then(setRows).catch((e) => onError((e as Error).message));
  }, [q, status, onError]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const openCompany = (id: string) => api<Company>(`/platform/companies/${id}`).then(setOpen).catch((e) => onError((e as Error).message));
  return (
    <div className="stack">
      <div className="pc-toolbar">
        <input className="input" placeholder="Search by company name or code…" aria-label="Search companies" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option><option value="ACTIVE">Active</option><option value="TRIAL">Trial</option>
          <option value="TRIAL_EXPIRED">Trial expired</option><option value="SUSPENDED">Suspended</option>
        </select>
      </div>
      {!rows ? <Loading /> : rows.length === 0 ? <p className="muted">No companies match.</p> : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Company</th><th>Status</th><th>Plan</th><th>Country</th><th className="num">Users</th><th className="num">Assets</th><th className="num">Work orders</th><th>Trial ends</th><th>Last sign-in</th><th>Created</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => openCompany(c.id)}>
                  <td><button type="button" className="link-btn" onClick={(e) => { e.stopPropagation(); openCompany(c.id); }}>{c.name}</button><div className="small muted">{c.code}{c.setupComplete ? "" : " · setup not finished"}</div></td>
                  <td><span className={`badge ${STATUS_TONE[c.status] ?? ""}`}>{c.status.replace("_", " ").toLowerCase()}</span></td>
                  <td>{c.plan}</td><td>{c.country}</td>
                  <td className="num">{c.users}{c.maxUsers ? ` / ${c.maxUsers}` : ""}</td><td className="num">{c.assets}{c.maxAssets ? ` / ${c.maxAssets}` : ""}</td><td className="num">{c.workOrders}</td>
                  <td>{day(c.trialEndsAt)}</td><td>{ago(c.lastLoginAt)}</td><td>{day(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <CompanyPanel c={open} onClose={() => setOpen(null)} onChanged={(c) => { setOpen(c); load(); }} />}
    </div>
  );
}

function CompanyPanel({ c, onClose, onChanged }: { c: Company; onClose: () => void; onChanged: (c: Company) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [plan, setPlan] = useState({ plan: c.plan, maxUsers: String(c.maxUsers ?? ""), maxAssets: String(c.maxAssets ?? "") });
  const act = async (path: string, body: unknown, done: string) => {
    setBusy(true); setErr(null); setNote(null);
    try { onChanged(await api<Company>(`/platform/companies/${c.id}:${path}`, { body })); setNote(done); }
    catch (e) { setErr((e as ApiError).message); }
    finally { setBusy(false); }
  };
  const support = async () => {
    const reason = window.prompt(`Why do you need read-only access to ${c.name}? The company's administrators will see this reason.`);
    if (!reason) return;
    setBusy(true); setErr(null);
    try {
      const s = await api<{ token: string; expiresAt: string }>(`/platform/companies/${c.id}:support-session`, { body: { reason, minutes: 60 } });
      window.open(`/support#token=${encodeURIComponent(s.token)}`, "_blank", "noopener");
      setNote(`Read-only support session opened in a new tab until ${new Date(s.expiresAt).toLocaleTimeString()}.`);
    } catch (e) { setErr((e as ApiError).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={c.name} onClick={onClose}>
      <div className="pc-panel card" onClick={(e) => e.stopPropagation()}>
        <div className="card-head"><div><h2 style={{ margin: 0 }}>{c.name}</h2><span className="small muted">{c.code} · {c.country} · {c.currency} · {c.industry ?? "no sector"}</span></div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close"><Icon name="X" size={16} /></button></div>
        <div className="card-body stack">
          {err && <Alert tone="danger">{err}</Alert>}
          {note && <Alert tone="ok">{note}</Alert>}
          <div className="pc-facts">
            <div><span>Status</span><b><span className={`badge ${STATUS_TONE[c.status] ?? ""}`}>{c.status.replace("_", " ").toLowerCase()}</span></b></div>
            <div><span>Plan</span><b>{c.plan}</b></div><div><span>Trial ends</span><b>{day(c.trialEndsAt)}</b></div>
            <div><span>Users</span><b>{c.users}{c.maxUsers ? ` / ${c.maxUsers}` : ""}</b></div><div><span>Assets</span><b>{c.assets}{c.maxAssets ? ` / ${c.maxAssets}` : ""}</b></div>
            <div><span>Sites</span><b>{c.sites ?? "—"}</b></div><div><span>Work orders</span><b>{c.workOrders}</b></div><div><span>PM plans</span><b>{c.pmPlans ?? "—"}</b></div>
            <div><span>Setup</span><b>{c.setupComplete ? "finished" : "not finished"}</b></div><div><span>Created</span><b>{day(c.createdAt)}</b></div>
          </div>
          {c.administrators && c.administrators.length > 0 && (
            <div><h3>Administrators</h3>
              <ul className="pc-admins">{c.administrators.map((a) => <li key={a.email}><b>{a.fullName}</b> · {a.role.toLowerCase()} · <a href={`mailto:${a.email}`}>{a.email}</a>{a.phone ? ` · ${a.phone}` : ""} · last sign-in {ago(a.lastLoginAt)}</li>)}</ul></div>
          )}
          <div className="pc-actions">
            <div><h3>Trial</h3><div className="row">
              {[7, 14, 30].map((d) => <button key={d} className="btn btn-sm" disabled={busy} onClick={() => act("extend-trial", { days: d }, `Trial extended by ${d} days.`)}>+{d} days</button>)}
            </div></div>
            <div><h3>Plan & limits</h3><div className="row">
              <select className="select" aria-label="Plan" value={plan.plan} onChange={(e) => setPlan({ ...plan, plan: e.target.value })}>
                {["TRIAL", "STARTER", "PROFESSIONAL", "ENTERPRISE", "PERPETUAL", "SOURCE"].map((p) => <option key={p}>{p}</option>)}</select>
              <input className="input" style={{ width: 110 }} aria-label="Max users" placeholder="Max users" inputMode="numeric" value={plan.maxUsers} onChange={(e) => setPlan({ ...plan, maxUsers: e.target.value })} />
              <input className="input" style={{ width: 120 }} aria-label="Max assets" placeholder="Max assets" inputMode="numeric" value={plan.maxAssets} onChange={(e) => setPlan({ ...plan, maxAssets: e.target.value })} />
              <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => act("set-plan", plan, "Plan updated.")}>Save</button>
            </div></div>
            <div><h3>Support</h3><div className="row">
              <button className="btn btn-sm" disabled={busy || c.status === "SUSPENDED"} onClick={support}><Icon name="LifeBuoy" size={14} />Open read-only support session</button>
            </div><p className="small muted" style={{ margin: "6px 0 0" }}>Up to 60 minutes. Recorded in the company&apos;s audit trail; its administrators are notified with your reason.</p></div>
            <div><h3>Access</h3><div className="row">
              {c.status === "SUSPENDED"
                ? <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => act("reactivate", {}, "Company reactivated.")}><Icon name="Unlock" size={14} />Reactivate</button>
                : <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => { const r = window.prompt(`Suspend ${c.name}? Its users will be signed out and unable to sign in. Reason:`); if (r) act("suspend", { reason: r }, "Company suspended."); }}><Icon name="Ban" size={14} />Suspend</button>}
            </div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SignupsTab({ onError }: { onError: (e: string) => void }) {
  const [rows, setRows] = useState<Signup[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => { api<Signup[]>("/platform/signups").then(setRows).catch((e) => onError((e as Error).message)); }, [onError]);
  useEffect(load, [load]);
  const decide = async (email: string, action: "approve" | "reject") => {
    if (action === "reject" && !window.confirm(`Reject the sign-up from ${email}? Nothing will be created.`)) return;
    setBusy(email);
    try { await api("/platform/signups:decide", { body: { email, action } }); load(); }
    catch (e) { onError((e as ApiError).message); }
    finally { setBusy(null); }
  };
  if (!rows) return <Loading />;
  if (!rows.length) return <div className="card"><div className="card-body muted">No sign-ups waiting. When e-mail sending is connected, sign-ups verify themselves and never appear here.</div></div>;
  return (
    <div className="stack">
      {rows.map((r) => (
        <div className="card" key={r.email}><div className="card-body pc-row">
          <div><b>{r.company}</b><div className="small muted">{r.fullName} · <a href={`mailto:${r.email}`}>{r.email}</a>{r.phone ? ` · ${r.phone}` : ""} · {r.country} · {r.industry ?? "—"} · {day(r.createdAt)}</div></div>
          <div className="row">
            <button className="btn btn-sm btn-primary" disabled={busy === r.email} onClick={() => decide(r.email, "approve")}><Icon name="Check" size={14} />Approve</button>
            <button className="btn btn-sm btn-danger" disabled={busy === r.email} onClick={() => decide(r.email, "reject")}><Icon name="X" size={14} />Reject</button>
          </div>
        </div></div>
      ))}
    </div>
  );
}

function MessagesTab({ onError }: { onError: (e: string) => void }) {
  const [all, setAll] = useState(false);
  const [rows, setRows] = useState<Message[] | null>(null);
  const load = useCallback(() => { api<Message[]>(`/platform/messages?all=${all}`).then(setRows).catch((e) => onError((e as Error).message)); }, [all, onError]);
  useEffect(load, [load]);
  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <label className="checkbox"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />Show read messages too</label>
        <button className="btn btn-sm" disabled={!rows?.some((m) => m.status === "NEW")} onClick={() => api("/platform/messages:read", { body: {} }).then(load).catch((e) => onError((e as Error).message))}><Icon name="CheckCheck" size={14} />Mark all as read</button>
      </div>
      {!rows ? <Loading /> : !rows.length ? <div className="card"><div className="card-body muted">No messages.</div></div> : rows.map((m, i) => (
        <article className="card" key={m.createdAt + i}><div className="card-body stack" style={{ gap: 8 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <b>{m.name}{m.company ? ` — ${m.company}` : ""}</b>
            <span className="row"><span className="badge tone-info">{m.topic.toLowerCase()}</span>{m.status === "NEW" && <span className="badge tone-warn">new</span>}<span className="small muted">{day(m.createdAt)}</span></span>
          </div>
          <div className="small muted"><a href={`mailto:${m.email}`}>{m.email}</a>{m.phone ? ` · ${m.phone}` : ""}{m.country ? ` · ${m.country}` : ""} · {m.language}</div>
          <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{m.message}</p>
        </div></article>
      ))}
    </div>
  );
}
