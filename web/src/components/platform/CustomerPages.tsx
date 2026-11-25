"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, Loading } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { Icon } from "@/lib/icons";
import { Badge, ConsoleHeader, ago, dateTime, day, label, money } from "./ConsoleShell";

type Company = {
  id: string; code: string; name: string; status: string; plan: string; country: string; currency: string; language: string; industry: string | null; source: string | null;
  users: number; assets: number; workOrders: number; maxUsers: number | null; maxAssets: number | null; trialEndsAt: string | null;
  createdAt: string | null; lastLoginAt?: string | null; setupComplete: boolean; sites?: number; pmPlans?: number;
  administrators?: { fullName: string; email: string; role: string; phone: string | null; status: string; lastLoginAt: string | null }[];
};

function useLoad<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    if (!path) return;
    api<T>(path).then((d) => { setData(d); setError(null); }).catch((e) => setError((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(reload, [reload]);
  return { data, error, reload, setData };
}

/* ------------------------------------------------------------------ dashboard */
export function DashboardPage() {
  const ov = useLoad<Record<string, number>>("/platform/overview");
  const growth = useLoad<{ weeks: { week: string; newCompanies: number }[]; activeUsers30d: number; mrrUsd: number }>("/platform/growth");
  const companies = useLoad<Company[]>("/platform/companies");
  const tickets = useLoad<{ id: string; number: string; subject: string; status: string; priority: string; updatedAt: string }[]>("/platform/tickets?status=ACTIVE");
  if (ov.error) return <Alert tone="danger">{ov.error}</Alert>;
  if (!ov.data || !growth.data) return <Loading />;
  const o = ov.data;
  const max = Math.max(1, ...growth.data.weeks.map((w) => w.newCompanies));
  const now = Date.now();
  const ending = (companies.data ?? []).filter((c) => c.status === "TRIAL" && c.trialEndsAt && new Date(c.trialEndsAt).getTime() - now < 14 * 86400000)
    .sort((a, b) => String(a.trialEndsAt).localeCompare(String(b.trialEndsAt))).slice(0, 6);
  const kpis: [string, number | string, string, string?][] = [
    ["Companies", o.companies, "Building2", "/platform/companies"], ["Active users (30 days)", growth.data.activeUsers30d, "Users"],
    ["Estimated MRR", `$${new Intl.NumberFormat("en-US").format(growth.data.mrrUsd)}`, "TrendingUp", "/platform/billing"],
    ["On trial", o.onTrial, "Hourglass"], ["Trials ending ≤ 7 days", o.trialsEndingIn7Days, "AlarmClock"], ["Expired trials", o.trialsExpired, "TriangleAlert"],
    ["Suspended", o.suspended, "Ban"], ["Setup not finished", o.setupIncomplete, "ListTodo"], ["Sign-ups waiting", o.pendingSignups, "UserPlus", "/platform/signups"],
    ["Assets managed", o.assets, "Boxes"],
  ];
  return (
    <div className="stack">
      <ConsoleHeader title="Dashboard" subtitle="Every customer workspace on OPES Maintain at a glance." />
      <div className="pc-kpis">
        {kpis.map(([l, v, i, href]) => {
          const inner = <><Icon name={i} size={18} /><b>{v ?? 0}</b><span>{l}</span></>;
          return href ? <Link key={l} href={href} className="pc-kpi pc-kpi-link">{inner}</Link> : <div key={l} className="pc-kpi">{inner}</div>;
        })}
      </div>
      <div className="pc-grid-2">
        <section className="card">
          <div className="card-head"><h3 style={{ margin: 0 }}>New companies per week</h3><span className="small muted">last 12 weeks · {o.newLast30Days} in 30 days</span></div>
          <div className="card-body">
            <div className="pc-bars" role="img" aria-label="New companies per week">
              {growth.data.weeks.map((w) => (
                <div key={w.week} className="pc-bar" title={`Week of ${day(w.week)}: ${w.newCompanies}`}>
                  <span style={{ height: `${(w.newCompanies / max) * 100}%` }} /><em>{w.newCompanies || ""}</em>
                </div>
              ))}
            </div>
            <div className="pc-bars-axis"><span>{day(growth.data.weeks[0]?.week)}</span><span>this week</span></div>
          </div>
        </section>
        <section className="card">
          <div className="card-head"><h3 style={{ margin: 0 }}>Trials ending soon</h3><Link className="small" href="/platform/companies">All companies</Link></div>
          <div className="card-body">
            {!ending.length ? <p className="muted" style={{ margin: 0 }}>No trial ends in the next 14 days.</p> : (
              <ul className="pc-list">{ending.map((c) => <li key={c.id}><Link href={`/platform/companies/${c.id}`}>{c.name}</Link><span>{day(c.trialEndsAt)} · {c.users} users</span></li>)}</ul>
            )}
          </div>
        </section>
        <section className="card">
          <div className="card-head"><h3 style={{ margin: 0 }}>Open support tickets</h3><Link className="small" href="/platform/tickets">Support desk</Link></div>
          <div className="card-body">
            {!tickets.data?.length ? <p className="muted" style={{ margin: 0 }}>No open tickets.</p> : (
              <ul className="pc-list">{tickets.data.slice(0, 6).map((t) => <li key={t.id}><Link href={`/platform/tickets/${t.id}`}>{t.subject}</Link><span><Badge v={t.priority} /> {ago(t.updatedAt)}</span></li>)}</ul>
            )}
          </div>
        </section>
        <section className="card">
          <div className="card-head"><h3 style={{ margin: 0 }}>Newest companies</h3></div>
          <div className="card-body">
            <ul className="pc-list">{(companies.data ?? []).slice(0, 6).map((c) => <li key={c.id}><Link href={`/platform/companies/${c.id}`}>{c.name}</Link><span><Badge v={c.status} /> {day(c.createdAt)}</span></li>)}</ul>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ companies */
export function CompaniesPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<Company[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => api<Company[]>(`/platform/companies?q=${encodeURIComponent(q)}&status=${status}`).then(setRows).catch((e) => setError((e as Error).message)), 250);
    return () => clearTimeout(t);
  }, [q, status]);
  const exportCsv = () => {
    if (!rows) return;
    const head = ["Company", "Code", "Status", "Plan", "Country", "Users", "Assets", "Work orders", "Trial ends", "Created", "Last sign-in"];
    const lines = rows.map((c) => [c.name, c.code, c.status, c.plan, c.country, c.users, c.assets, c.workOrders, c.trialEndsAt ?? "", c.createdAt ?? "", c.lastLoginAt ?? ""]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const url = URL.createObjectURL(new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "opes-companies.csv"; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <div className="stack">
      <ConsoleHeader title="Companies" subtitle="Every customer workspace, its plan, usage and activity." actions={<button className="btn btn-sm" onClick={exportCsv} disabled={!rows?.length}><Icon name="Download" size={14} />Export CSV</button>} />
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="pc-toolbar">
        <div className="pc-search"><Icon name="Search" size={16} /><input className="input" placeholder="Search by company name or code…" aria-label="Search companies" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="pc-chips" role="group" aria-label="Filter by status">
          {[["", "All"], ["ACTIVE", "Active"], ["TRIAL", "Trial"], ["TRIAL_EXPIRED", "Trial expired"], ["SUSPENDED", "Suspended"]].map(([v, l]) => (
            <button key={v} type="button" aria-pressed={status === v} onClick={() => setStatus(v)}>{l}</button>
          ))}
        </div>
      </div>
      {!rows ? <Loading /> : !rows.length ? <div className="card"><div className="card-body muted">No companies match.</div></div> : (
        <div className="card pc-table-wrap">
          <table className="table">
            <thead><tr><th>Company</th><th>Status</th><th>Plan</th><th>Country</th><th className="num">Users</th><th className="num">Assets</th><th className="num">Work orders</th><th>Trial ends</th><th>Last sign-in</th><th>Created</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td><Link className="pc-strong" href={`/platform/companies/${c.id}`}>{c.name}</Link><div className="small muted">{c.code}{c.setupComplete ? "" : " · setup not finished"}</div></td>
                  <td><Badge v={c.status} /></td><td>{c.plan}</td><td>{c.country}</td>
                  <td className="num">{c.users}{c.maxUsers ? ` / ${c.maxUsers}` : ""}</td><td className="num">{c.assets}{c.maxAssets ? ` / ${c.maxAssets}` : ""}</td><td className="num">{c.workOrders}</td>
                  <td>{day(c.trialEndsAt)}</td><td>{ago(c.lastLoginAt)}</td><td>{day(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ company detail */
const TABS = [["overview", "Overview"], ["users", "Users"], ["usage", "Usage"], ["billing", "Billing"], ["support", "Support"], ["notes", "Notes"], ["activity", "Activity"]] as const;

export function CompanyDetailPage({ id }: { id: string }) {
  const c = useLoad<Company>(`/platform/companies/${id}`);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("overview");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const act = async (path: string, body: unknown, done: string) => {
    setBusy(true); setMsg(null);
    try { c.setData(await api<Company>(`/platform/companies/${id}:${path}`, { body })); setMsg({ tone: "ok", text: done }); }
    catch (e) { setMsg({ tone: "danger", text: (e as ApiError).message }); }
    finally { setBusy(false); }
  };
  const support = async () => {
    const reason = window.prompt("Why do you need read-only access? The company's administrators will see this reason.");
    if (!reason) return;
    setBusy(true);
    try {
      const s = await api<{ token: string; expiresAt: string }>(`/platform/companies/${id}:support-session`, { body: { reason, minutes: 60 } });
      window.open(`/support#token=${encodeURIComponent(s.token)}`, "_blank", "noopener");
      setMsg({ tone: "ok", text: `Read-only support session opened in a new tab until ${new Date(s.expiresAt).toLocaleTimeString()}.` });
    } catch (e) { setMsg({ tone: "danger", text: (e as ApiError).message }); }
    finally { setBusy(false); }
  };
  if (c.error) return <Alert tone="danger">{c.error}</Alert>;
  if (!c.data) return <Loading />;
  const co = c.data;
  return (
    <div className="stack">
      <div className="crumbs"><Link href="/platform/companies">Companies</Link> <Icon name="ChevronRight" size={14} /> {co.name}</div>
      <ConsoleHeader title={co.name} subtitle={`${co.code} · ${co.country} · ${co.currency} · ${co.language} · ${label(co.industry)} · joined ${day(co.createdAt)}`}
        actions={<>
          <Badge v={co.status} />
          <button className="btn btn-sm" disabled={busy || co.status === "SUSPENDED"} onClick={support}><Icon name="LifeBuoy" size={14} />Support session</button>
          {co.status === "SUSPENDED"
            ? <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => act("reactivate", {}, "Company reactivated.")}><Icon name="Unlock" size={14} />Reactivate</button>
            : <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => { const r = window.prompt(`Suspend ${co.name}? Its users are signed out and cannot sign in. Reason:`); if (r) act("suspend", { reason: r }, "Company suspended."); }}><Icon name="Ban" size={14} />Suspend</button>}
        </>} />
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="tabs" role="tablist">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === "overview" && <CompanyOverview co={co} busy={busy} act={act} />}
      {tab === "users" && <CompanyUsers id={id} />}
      {tab === "usage" && <CompanyUsage id={id} />}
      {tab === "billing" && <CompanyBilling id={id} currency={co.currency} />}
      {tab === "support" && <CompanyTickets id={id} name={co.name} />}
      {tab === "notes" && <CompanyNotes id={id} />}
      {tab === "activity" && <CompanyActivity id={id} />}
    </div>
  );
}

function CompanyOverview({ co, busy, act }: { co: Company; busy: boolean; act: (p: string, b: unknown, d: string) => void }) {
  const [plan, setPlan] = useState({ plan: co.plan, maxUsers: String(co.maxUsers ?? ""), maxAssets: String(co.maxAssets ?? "") });
  return (
    <div className="stack">
      <div className="pc-facts">
        {([["Plan", co.plan], ["Trial ends", day(co.trialEndsAt)], ["Users", `${co.users}${co.maxUsers ? ` / ${co.maxUsers}` : ""}`], ["Assets", `${co.assets}${co.maxAssets ? ` / ${co.maxAssets}` : ""}`],
          ["Sites", co.sites ?? "—"], ["Work orders", co.workOrders], ["PM plans", co.pmPlans ?? "—"], ["Setup", co.setupComplete ? "finished" : "not finished"], ["Source", label(co.source)]] as [string, string | number][])
          .map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}
      </div>
      <div className="pc-grid-2">
        <section className="card"><div className="card-head"><h3 style={{ margin: 0 }}>Administrators</h3></div><div className="card-body">
          {!co.administrators?.length ? <p className="muted" style={{ margin: 0 }}>No administrators.</p> : (
            <ul className="pc-list">{co.administrators.map((a) => <li key={a.email}><span><b>{a.fullName}</b> · {label(a.role)}<br /><a href={`mailto:${a.email}`}>{a.email}</a>{a.phone ? ` · ${a.phone}` : ""}</span><span>{ago(a.lastLoginAt)}</span></li>)}</ul>
          )}
        </div></section>
        <section className="card"><div className="card-head"><h3 style={{ margin: 0 }}>Subscription</h3></div><div className="card-body stack">
          <div><div className="small muted" style={{ marginBottom: 6 }}>Extend trial</div><div className="row">
            {[7, 14, 30].map((d) => <button key={d} className="btn btn-sm" disabled={busy} onClick={() => act("extend-trial", { days: d }, `Trial extended by ${d} days.`)}>+{d} days</button>)}
          </div></div>
          <div><div className="small muted" style={{ marginBottom: 6 }}>Plan and limits</div><div className="row">
            <select className="select" style={{ width: "auto" }} aria-label="Plan" value={plan.plan} onChange={(e) => setPlan({ ...plan, plan: e.target.value })}>
              {["TRIAL", "STARTER", "PROFESSIONAL", "ENTERPRISE", "PERPETUAL", "SOURCE"].map((p) => <option key={p}>{p}</option>)}</select>
            <input className="input" style={{ width: 110 }} aria-label="Max users" placeholder="Max users" inputMode="numeric" value={plan.maxUsers} onChange={(e) => setPlan({ ...plan, maxUsers: e.target.value })} />
            <input className="input" style={{ width: 120 }} aria-label="Max assets" placeholder="Max assets" inputMode="numeric" value={plan.maxAssets} onChange={(e) => setPlan({ ...plan, maxAssets: e.target.value })} />
            <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => act("set-plan", plan, "Plan updated.")}>Save</button>
          </div></div>
        </div></section>
      </div>
    </div>
  );
}

function CompanyUsers({ id }: { id: string }) {
  const u = useLoad<{ fullName: string; email: string; role: string; status: string; phone: string | null; mfa: boolean; support: boolean; lastLoginAt: string | null }[]>(`/platform/companies/${id}/users`);
  if (u.error) return <Alert tone="danger">{u.error}</Alert>;
  if (!u.data) return <Loading />;
  return (
    <div className="card pc-table-wrap"><table className="table">
      <thead><tr><th>Name</th><th>E-mail</th><th>Role</th><th>Status</th><th>Two-step</th><th>Last sign-in</th></tr></thead>
      <tbody>{u.data.map((x) => <tr key={x.email}><td>{x.fullName}{x.support && <span className="badge tone-violet" style={{ marginLeft: 6 }}>OPES support</span>}</td><td><a href={`mailto:${x.email}`}>{x.email}</a></td><td>{label(x.role)}</td><td><Badge v={x.status} /></td><td>{x.mfa ? "on" : "off"}</td><td>{ago(x.lastLoginAt)}</td></tr>)}</tbody>
    </table></div>
  );
}

const USAGE_LABELS: Record<string, string> = {
  Site: "Sites", Asset: "Assets", WorkOrder: "Work orders", closedWorkOrders: "Closed work orders", MaintenanceRequest: "Requests", PmPlan: "PM plans", Part: "Spare parts",
  WorkPermit: "Permits", InspectionResult: "Inspections", CalibrationEvent: "Calibrations", Document: "Documents", AppUser: "Users", catalogClasses: "Catalog equipment types",
};
function CompanyUsage({ id }: { id: string }) {
  const u = useLoad<Record<string, number>>(`/platform/companies/${id}/usage`);
  if (u.error) return <Alert tone="danger">{u.error}</Alert>;
  if (!u.data) return <Loading />;
  return <div className="pc-kpis">{Object.entries(u.data).map(([k, v]) => <div key={k} className="pc-kpi"><b>{v}</b><span>{USAGE_LABELS[k] ?? k}</span></div>)}</div>;
}

function CompanyBilling({ id, currency }: { id: string; currency: string }) {
  const inv = useLoad<{ id: string; number: string; description: string; amount: number; currency: string; status: string; dueOn: string | null; paidOn: string | null }[]>(`/platform/invoices?tenantId=${id}`);
  const [f, setF] = useState({ description: "", amount: "", dueOn: "" });
  const [err, setErr] = useState<string | null>(null);
  const create = async () => {
    setErr(null);
    try { await api("/platform/invoices", { body: { tenantId: id, ...f, currency } }); setF({ description: "", amount: "", dueOn: "" }); inv.reload(); }
    catch (e) { setErr((e as ApiError).message); }
  };
  return (
    <div className="stack">
      <section className="card"><div className="card-head"><h3 style={{ margin: 0 }}>New invoice</h3></div><div className="card-body stack">
        {err && <Alert tone="danger">{err}</Alert>}
        <div className="row">
          <input className="input" style={{ flex: "2 1 260px" }} placeholder="Description, e.g. Subscription January 2027 (8 users)" aria-label="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <input className="input" style={{ flex: "1 1 120px" }} placeholder={`Amount (${currency})`} aria-label="Amount" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          <input className="input" style={{ flex: "1 1 140px" }} type="date" aria-label="Due date" value={f.dueOn} onChange={(e) => setF({ ...f, dueOn: e.target.value })} />
          <button className="btn btn-primary" onClick={create} disabled={!f.description || !f.amount}><Icon name="Plus" size={14} />Create</button>
        </div>
      </div></section>
      <InvoiceTable rows={inv.data} reload={inv.reload} showCompany={false} />
    </div>
  );
}

export function InvoiceTable({ rows, reload, showCompany }: { rows: { id: string; number: string; company?: string; description: string; amount: number; currency: string; status: string; dueOn: string | null; paidOn: string | null }[] | null; reload: () => void; showCompany: boolean }) {
  const [err, setErr] = useState<string | null>(null);
  const set = async (id: string, status: string) => {
    const reference = status === "PAID" ? window.prompt("Payment reference (bank transfer, mobile money, cheque…)") ?? "" : undefined;
    if (status === "PAID" && reference === "") return;
    try { await api(`/platform/invoices/${id}:status`, { body: { status, reference } }); reload(); } catch (e) { setErr((e as ApiError).message); }
  };
  if (!rows) return <Loading />;
  if (!rows.length) return <div className="card"><div className="card-body muted">No invoices yet.</div></div>;
  return (
    <div className="card pc-table-wrap">
      {err && <Alert tone="danger">{err}</Alert>}
      <table className="table">
        <thead><tr><th>Number</th>{showCompany && <th>Company</th>}<th>Description</th><th className="num">Amount</th><th>Status</th><th>Due</th><th>Paid</th><th /></tr></thead>
        <tbody>{rows.map((i) => (
          <tr key={i.id}>
            <td className="mono">{i.number}</td>{showCompany && <td>{i.company}</td>}<td>{i.description}</td><td className="num">{money(i.amount, i.currency)}</td>
            <td><Badge v={i.status} /></td><td>{day(i.dueOn)}</td><td>{day(i.paidOn)}</td>
            <td><div className="row" style={{ justifyContent: "flex-end" }}>
              {i.status === "DRAFT" && <button className="btn btn-sm" onClick={() => set(i.id, "SENT")}>Mark sent</button>}
              {(i.status === "SENT" || i.status === "OVERDUE") && <button className="btn btn-sm btn-primary" onClick={() => set(i.id, "PAID")}>Mark paid</button>}
              {i.status !== "PAID" && i.status !== "VOID" && <button className="btn btn-sm btn-ghost" onClick={() => window.confirm(`Void invoice ${i.number}?`) && set(i.id, "VOID")}>Void</button>}
            </div></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function CompanyTickets({ id, name }: { id: string; name: string }) {
  const t = useLoad<{ id: string; number: string; subject: string; status: string; priority: string; updatedAt: string }[]>(`/platform/tickets?tenantId=${id}`);
  const open = async () => {
    const subject = window.prompt(`New ticket for ${name} — subject:`);
    if (!subject) return;
    const r = await api<{ id: string }>("/platform/tickets", { body: { tenantId: id, subject, priority: "NORMAL" } });
    window.location.href = `/platform/tickets/${r.id}`;
  };
  if (!t.data) return <Loading />;
  return (
    <div className="stack">
      <div className="row"><button className="btn btn-sm btn-primary" onClick={open}><Icon name="Plus" size={14} />New ticket</button></div>
      {!t.data.length ? <div className="card"><div className="card-body muted">No tickets for this company.</div></div> : (
        <div className="card pc-table-wrap"><table className="table"><thead><tr><th>Ticket</th><th>Subject</th><th>Priority</th><th>Status</th><th>Updated</th></tr></thead>
          <tbody>{t.data.map((x) => <tr key={x.id}><td className="mono">{x.number}</td><td><Link href={`/platform/tickets/${x.id}`}>{x.subject}</Link></td><td><Badge v={x.priority} /></td><td><Badge v={x.status} /></td><td>{ago(x.updatedAt)}</td></tr>)}</tbody></table></div>
      )}
    </div>
  );
}

function CompanyNotes({ id }: { id: string }) {
  const n = useLoad<{ id: string; author: string; body: string; createdAt: string }[]>(`/platform/companies/${id}/notes`);
  const [text, setText] = useState("");
  const add = async () => { n.setData(await api(`/platform/companies/${id}/notes`, { body: { body: text } })); setText(""); };
  return (
    <div className="stack">
      <section className="card"><div className="card-body stack">
        <textarea className="textarea" placeholder="Private note about this company (only OPES operators can read it)…" aria-label="New note" value={text} onChange={(e) => setText(e.target.value)} />
        <div><button className="btn btn-primary btn-sm" disabled={!text.trim()} onClick={add}><Icon name="StickyNote" size={14} />Add note</button></div>
      </div></section>
      {!n.data ? <Loading /> : !n.data.length ? <p className="muted">No notes yet.</p> : n.data.map((x) => (
        <article key={x.id} className="card"><div className="card-body"><div className="small muted">{x.author} · {dateTime(x.createdAt)}</div><p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{x.body}</p></div></article>
      ))}
    </div>
  );
}

function CompanyActivity({ id }: { id: string }) {
  const a = useLoad<{ occurredAt: string; actor: string; action: string; entityType: string; detail: string | null }[]>(`/platform/companies/${id}/activity`);
  if (a.error) return <Alert tone="danger">{a.error}</Alert>;
  if (!a.data) return <Loading />;
  if (!a.data.length) return <p className="muted">No activity recorded.</p>;
  return (
    <div className="card pc-table-wrap"><table className="table"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th></tr></thead>
      <tbody>{a.data.map((x, i) => <tr key={i}><td>{dateTime(x.occurredAt)}</td><td>{x.actor}</td><td>{label(x.action)}</td><td>{x.entityType}</td></tr>)}</tbody></table></div>
  );
}

/* ------------------------------------------------------------------ sign-ups */
export function SignupsPage() {
  const s = useLoad<{ email: string; fullName: string; company: string; country: string; phone: string | null; industry: string | null; createdAt: string }[]>("/platform/signups");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const decide = async (email: string, action: "approve" | "reject") => {
    if (action === "reject" && !window.confirm(`Reject the sign-up from ${email}? Nothing will be created.`)) return;
    setBusy(email); setErr(null);
    try { await api("/platform/signups:decide", { body: { email, action } }); s.reload(); } catch (e) { setErr((e as ApiError).message); } finally { setBusy(null); }
  };
  return (
    <div className="stack">
      <ConsoleHeader title="Sign-ups" subtitle="Companies waiting for approval while e-mail verification is not connected." />
      {err && <Alert tone="danger">{err}</Alert>}
      {!s.data ? <Loading /> : !s.data.length ? <div className="card"><div className="card-body muted">No sign-ups waiting.</div></div> : (
        <div className="card pc-table-wrap"><table className="table">
          <thead><tr><th>Company</th><th>Contact</th><th>Country</th><th>Sector</th><th>Received</th><th /></tr></thead>
          <tbody>{s.data.map((r) => (
            <tr key={r.email}>
              <td className="pc-strong">{r.company}</td><td>{r.fullName}<div className="small"><a href={`mailto:${r.email}`}>{r.email}</a>{r.phone ? ` · ${r.phone}` : ""}</div></td>
              <td>{r.country}</td><td>{label(r.industry)}</td><td>{dateTime(r.createdAt)}</td>
              <td><div className="row" style={{ justifyContent: "flex-end" }}>
                <button className="btn btn-sm btn-primary" disabled={busy === r.email} onClick={() => decide(r.email, "approve")}><Icon name="Check" size={14} />Approve</button>
                <button className="btn btn-sm btn-danger" disabled={busy === r.email} onClick={() => decide(r.email, "reject")}><Icon name="X" size={14} />Reject</button>
              </div></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}
