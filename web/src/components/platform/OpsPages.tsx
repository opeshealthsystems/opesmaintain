"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, Loading } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { Icon } from "@/lib/icons";
import { Badge, ConsoleHeader, ago, dateTime, day, label } from "./ConsoleShell";
import { InvoiceTable } from "./CustomerPages";

function useLoad<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => { api<T>(path).then((d) => { setData(d); setError(null); }).catch((e) => setError((e as Error).message)); }, [path]);
  useEffect(reload, [reload]);
  return { data, error, reload, setData };
}

type Ticket = { id: string; number: string; subject: string; status: string; priority: string; source: string; topic: string | null; assignee: string | null;
  requesterName: string | null; requesterEmail: string | null; requesterPhone: string | null; tenantId: string | null; company: string | null;
  createdAt: string; updatedAt: string; resolvedAt: string | null; conversation?: { author: string; body: string; internal: boolean; createdAt: string }[] };

/* ------------------------------------------------------------------ support desk */
export function TicketsPage() {
  const [status, setStatus] = useState("ACTIVE");
  const t = useLoad<Ticket[]>(`/platform/tickets?status=${status}`);
  const create = async () => {
    const subject = window.prompt("Subject of the new ticket:");
    if (!subject) return;
    const email = window.prompt("Requester e-mail (optional):") ?? "";
    const r = await api<{ id: string }>("/platform/tickets", { body: { subject, requesterEmail: email, priority: "NORMAL" } });
    window.location.href = `/platform/tickets/${r.id}`;
  };
  return (
    <div className="stack">
      <ConsoleHeader title="Support desk" subtitle="Website messages arrive here automatically. Reply, assign, link to a company and resolve."
        actions={<button className="btn btn-sm btn-primary" onClick={create}><Icon name="Plus" size={14} />New ticket</button>} />
      <div className="pc-chips" role="group" aria-label="Filter tickets">
        {[["ACTIVE", "Open & pending"], ["OPEN", "Open"], ["PENDING", "Pending"], ["RESOLVED", "Resolved"], ["CLOSED", "Closed"], ["", "All"]].map(([v, l]) => (
          <button key={v} type="button" aria-pressed={status === v} onClick={() => setStatus(v)}>{l}</button>
        ))}
      </div>
      {t.error && <Alert tone="danger">{t.error}</Alert>}
      {!t.data ? <Loading /> : !t.data.length ? <div className="card"><div className="card-body muted">No tickets here.</div></div> : (
        <div className="card pc-table-wrap"><table className="table">
          <thead><tr><th>Ticket</th><th>Subject</th><th>Requester</th><th>Company</th><th>Priority</th><th>Status</th><th>Assignee</th><th>Updated</th></tr></thead>
          <tbody>{t.data.map((x) => (
            <tr key={x.id}>
              <td className="mono">{x.number}</td><td><Link className="pc-strong" href={`/platform/tickets/${x.id}`}>{x.subject}</Link><div className="small muted">{label(x.source)}{x.topic ? ` · ${label(x.topic)}` : ""}</div></td>
              <td>{x.requesterName ?? "—"}<div className="small">{x.requesterEmail}</div></td><td>{x.company ?? "—"}</td>
              <td><Badge v={x.priority} /></td><td><Badge v={x.status} /></td><td>{x.assignee ?? "—"}</td><td>{ago(x.updatedAt)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

export function TicketDetailPage({ id }: { id: string }) {
  const t = useLoad<Ticket>(`/platform/tickets/${id}`);
  const companies = useLoad<{ id: string; name: string }[]>("/platform/companies");
  const operators = useLoad<{ email: string; fullName: string; status: string }[]>("/platform/operators");
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const update = async (body: Record<string, unknown>) => {
    setErr(null);
    try { t.setData(await api<Ticket>(`/platform/tickets/${id}:update`, { body })); } catch (e) { setErr((e as ApiError).message); }
  };
  if (t.error) return <Alert tone="danger">{t.error}</Alert>;
  if (!t.data) return <Loading />;
  const x = t.data;
  const mailto = x.requesterEmail ? `mailto:${x.requesterEmail}?subject=${encodeURIComponent(`[${x.number}] ${x.subject}`)}` : null;
  return (
    <div className="stack">
      <div className="crumbs"><Link href="/platform/tickets">Support desk</Link> <Icon name="ChevronRight" size={14} /> {x.number}</div>
      <ConsoleHeader title={x.subject} subtitle={`${x.number} · ${label(x.source)} · opened ${dateTime(x.createdAt)}`} actions={<><Badge v={x.priority} /><Badge v={x.status} /></>} />
      {err && <Alert tone="danger">{err}</Alert>}
      <div className="pc-ticket">
        <div className="stack">
          {(x.conversation ?? []).map((n, i) => (
            <article key={i} className={`card pc-msg ${n.internal ? "internal" : ""}`}><div className="card-body">
              <div className="small muted">{n.author} · {dateTime(n.createdAt)}{n.internal && <span className="badge tone-warn" style={{ marginLeft: 8 }}>internal</span>}</div>
              <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{n.body}</p>
            </div></article>
          ))}
          <section className="card"><div className="card-body stack">
            <textarea className="textarea" placeholder="Write a reply or an internal note…" aria-label="Reply" value={reply} onChange={(e) => setReply(e.target.value)} />
            <div className="row" style={{ justifyContent: "space-between" }}>
              <label className="checkbox"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />Internal note (not for the customer)</label>
              <div className="row">
                {mailto && !internal && <a className="btn btn-sm" href={`${mailto}&body=${encodeURIComponent(reply)}`}><Icon name="Mail" size={14} />Open in e-mail</a>}
                <button className="btn btn-sm btn-primary" disabled={!reply.trim()} onClick={async () => { await update({ reply, internal }); setReply(""); }}>
                  <Icon name="Send" size={14} />{internal ? "Add note" : "Record reply"}</button>
              </div>
            </div>
            <p className="small muted" style={{ margin: 0 }}>Replies are recorded here. Until e-mail sending is connected, send them to the customer with “Open in e-mail”.</p>
          </div></section>
        </div>
        <aside className="card"><div className="card-body stack">
          <div className="field"><label htmlFor="t-status">Status</label>
            <select id="t-status" className="select" value={x.status} onChange={(e) => update({ status: e.target.value })}>{["OPEN", "PENDING", "RESOLVED", "CLOSED"].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></div>
          <div className="field"><label htmlFor="t-pri">Priority</label>
            <select id="t-pri" className="select" value={x.priority} onChange={(e) => update({ priority: e.target.value })}>{["LOW", "NORMAL", "HIGH", "URGENT"].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></div>
          <div className="field"><label htmlFor="t-as">Assignee</label>
            <select id="t-as" className="select" value={x.assignee ?? ""} onChange={(e) => update({ assignee: e.target.value || null })}>
              <option value="">Unassigned</option>{(operators.data ?? []).filter((o) => o.status === "ACTIVE").map((o) => <option key={o.email} value={o.email}>{o.fullName}</option>)}</select></div>
          <div className="field"><label htmlFor="t-co">Company</label>
            <select id="t-co" className="select" value={x.tenantId ?? ""} onChange={(e) => update({ tenantId: e.target.value || null })}>
              <option value="">Not linked</option>{(companies.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          {x.tenantId && <Link className="small" href={`/platform/companies/${x.tenantId}`}>Open company →</Link>}
          <div className="pc-requester"><b>Requester</b><span>{x.requesterName ?? "—"}</span>
            {x.requesterEmail && <a href={`mailto:${x.requesterEmail}`}>{x.requesterEmail}</a>}{x.requesterPhone && <a href={`tel:${x.requesterPhone}`}>{x.requesterPhone}</a>}</div>
          <div className="small muted">Updated {ago(x.updatedAt)}{x.resolvedAt ? ` · resolved ${day(x.resolvedAt)}` : ""}</div>
        </div></aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ billing */
export function BillingPage() {
  const rev = useLoad<{ mrrUsd: number; payingCompanies: number; outstanding: number; overdue: number; paidThisMonth: number; note: string }>("/platform/revenue");
  const inv = useLoad<{ id: string; number: string; company: string; description: string; amount: number; currency: string; status: string; dueOn: string | null; paidOn: string | null }[]>("/platform/invoices");
  const companies = useLoad<{ id: string; name: string; currency: string }[]>("/platform/companies");
  const [f, setF] = useState({ tenantId: "", description: "", amount: "", dueOn: "" });
  const [filter, setFilter] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const create = async () => {
    setErr(null);
    const cur = companies.data?.find((c) => c.id === f.tenantId)?.currency;
    try { await api("/platform/invoices", { body: { ...f, currency: cur } }); setF({ tenantId: "", description: "", amount: "", dueOn: "" }); inv.reload(); rev.reload(); }
    catch (e) { setErr((e as ApiError).message); }
  };
  const rows = (inv.data ?? []).filter((i) => !filter || i.status === filter);
  return (
    <div className="stack">
      <ConsoleHeader title="Billing & invoices" subtitle="Invoice customers for subscriptions, licenses, onboarding and support; track what is paid and overdue." />
      {rev.data && (
        <div className="pc-kpis">
          <div className="pc-kpi"><Icon name="TrendingUp" size={18} /><b>${new Intl.NumberFormat("en-US").format(rev.data.mrrUsd)}</b><span>Estimated MRR (USD)</span></div>
          <div className="pc-kpi"><Icon name="Building2" size={18} /><b>{rev.data.payingCompanies}</b><span>Paying companies</span></div>
          <div className="pc-kpi"><Icon name="Clock" size={18} /><b>{new Intl.NumberFormat("fr-FR").format(Number(rev.data.outstanding))}</b><span>Outstanding (sent, unpaid)</span></div>
          <div className="pc-kpi"><Icon name="TriangleAlert" size={18} /><b>{rev.data.overdue}</b><span>Overdue invoices</span></div>
          <div className="pc-kpi"><Icon name="CircleCheck" size={18} /><b>{new Intl.NumberFormat("fr-FR").format(Number(rev.data.paidThisMonth))}</b><span>Paid this month</span></div>
        </div>
      )}
      {rev.data && <p className="small muted" style={{ margin: 0 }}>{rev.data.note}</p>}
      <section className="card"><div className="card-head"><h3 style={{ margin: 0 }}>New invoice</h3></div><div className="card-body stack">
        {err && <Alert tone="danger">{err}</Alert>}
        <div className="row">
          <select className="select" style={{ flex: "1 1 200px" }} aria-label="Company" value={f.tenantId} onChange={(e) => setF({ ...f, tenantId: e.target.value })}>
            <option value="">Choose a company…</option>{(companies.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <input className="input" style={{ flex: "2 1 240px" }} placeholder="Description" aria-label="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <input className="input" style={{ flex: "1 1 120px" }} placeholder="Amount" aria-label="Amount" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          <input className="input" style={{ flex: "1 1 140px" }} type="date" aria-label="Due date" value={f.dueOn} onChange={(e) => setF({ ...f, dueOn: e.target.value })} />
          <button className="btn btn-primary" disabled={!f.tenantId || !f.description || !f.amount} onClick={create}><Icon name="Plus" size={14} />Create</button>
        </div>
      </div></section>
      <div className="pc-chips" role="group" aria-label="Filter invoices">
        {[["", "All"], ["DRAFT", "Draft"], ["SENT", "Sent"], ["OVERDUE", "Overdue"], ["PAID", "Paid"], ["VOID", "Void"]].map(([v, l]) => <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</button>)}
      </div>
      <InvoiceTable rows={inv.data ? rows : null} reload={() => { inv.reload(); rev.reload(); }} showCompany />
    </div>
  );
}

/* ------------------------------------------------------------------ announcements */
export function AnnouncementsPage() {
  const a = useLoad<{ id: string; title: string; body: string; level: string; audience: string; startsAt: string; endsAt: string | null; live: boolean; createdBy: string }[]>("/platform/announcements");
  const [f, setF] = useState({ title: "", body: "", level: "INFO", audience: "ALL", startsAt: "", endsAt: "" });
  const [err, setErr] = useState<string | null>(null);
  const create = async () => {
    setErr(null);
    try { await api("/platform/announcements", { body: f }); setF({ title: "", body: "", level: "INFO", audience: "ALL", startsAt: "", endsAt: "" }); a.reload(); }
    catch (e) { setErr((e as ApiError).message); }
  };
  return (
    <div className="stack">
      <ConsoleHeader title="Announcements" subtitle="Messages shown at the top of every customer's app: maintenance windows, new features, important notices." />
      <section className="card"><div className="card-head"><h3 style={{ margin: 0 }}>New announcement</h3></div><div className="card-body stack">
        {err && <Alert tone="danger">{err}</Alert>}
        <input className="input" placeholder="Title, e.g. Scheduled maintenance on Saturday" aria-label="Title" maxLength={160} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <textarea className="textarea" placeholder="Message" aria-label="Message" maxLength={2000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        <div className="form-grid">
          <div className="field"><label htmlFor="an-l">Type</label><select id="an-l" className="select" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}><option value="INFO">Information</option><option value="MAINTENANCE">Maintenance</option><option value="WARNING">Warning</option></select></div>
          <div className="field"><label htmlFor="an-a">Audience</label><select id="an-a" className="select" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}><option value="ALL">All companies</option><option value="TRIAL">Companies on trial</option><option value="PAYING">Paying companies</option></select></div>
          <div className="field"><label htmlFor="an-s">Starts (UTC)</label><input id="an-s" className="input" type="datetime-local" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /><span className="hint">Empty = now</span></div>
          <div className="field"><label htmlFor="an-e">Ends (UTC)</label><input id="an-e" className="input" type="datetime-local" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /><span className="hint">Empty = until you end it</span></div>
        </div>
        <div><button className="btn btn-primary" disabled={!f.title || !f.body} onClick={create}><Icon name="Megaphone" size={14} />Publish</button></div>
      </div></section>
      {!a.data ? <Loading /> : !a.data.length ? <p className="muted">No announcements yet.</p> : a.data.map((x) => (
        <article key={x.id} className="card"><div className="card-body stack" style={{ gap: 6 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <b>{x.title}</b>
            <div className="row"><Badge v={x.level} />{x.live ? <span className="badge tone-ok">live</span> : <span className="badge tone-neutral">{new Date(x.startsAt) > new Date() ? "scheduled" : "ended"}</span>}
              {x.live && <button className="btn btn-sm" onClick={() => api(`/platform/announcements/${x.id}:end`, { body: {} }).then(a.reload)}>End now</button>}</div>
          </div>
          <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{x.body}</p>
          <div className="small muted">{label(x.audience)} · {dateTime(x.startsAt)} → {x.endsAt ? dateTime(x.endsAt) : "no end"} · by {x.createdBy}</div>
        </div></article>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ operators */
export function OperatorsPage() {
  const o = useLoad<{ id: string; fullName: string; email: string; status: string; mfa: boolean; lastLoginAt: string | null }[]>("/platform/operators");
  const [f, setF] = useState({ email: "", fullName: "" });
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const add = async () => {
    setMsg(null);
    try { o.setData(await api("/platform/operators", { body: f })); setMsg({ tone: "ok", text: `${f.email} added. Set their password on the server with: opes-set-password ${f.email}` }); setF({ email: "", fullName: "" }); }
    catch (e) { setMsg({ tone: "danger", text: (e as ApiError).message }); }
  };
  const toggle = async (id: string, enable: boolean) => {
    setMsg(null);
    try { o.setData(await api(`/platform/operators/${id}:${enable ? "enable" : "disable"}`, { body: {} })); } catch (e) { setMsg({ tone: "danger", text: (e as ApiError).message }); }
  };
  return (
    <div className="stack">
      <ConsoleHeader title="Operators" subtitle="People at Opesware who can use this console. Two-step sign-in is required for every operator." />
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <section className="card"><div className="card-head"><h3 style={{ margin: 0 }}>Add an operator</h3></div><div className="card-body row">
        <input className="input" style={{ flex: "1 1 200px" }} placeholder="Full name" aria-label="Full name" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
        <input className="input" style={{ flex: "1 1 240px" }} type="email" placeholder="E-mail" aria-label="E-mail" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <button className="btn btn-primary" disabled={!f.email} onClick={add}><Icon name="UserPlus" size={14} />Add</button>
      </div></section>
      {!o.data ? <Loading /> : (
        <div className="card pc-table-wrap"><table className="table">
          <thead><tr><th>Name</th><th>E-mail</th><th>Status</th><th>Two-step</th><th>Last sign-in</th><th /></tr></thead>
          <tbody>{o.data.map((x) => (
            <tr key={x.id}><td className="pc-strong">{x.fullName}</td><td>{x.email}</td><td><Badge v={x.status} /></td><td>{x.mfa ? "on" : "not set up"}</td><td>{ago(x.lastLoginAt)}</td>
              <td><div className="row" style={{ justifyContent: "flex-end" }}>{x.status === "ACTIVE"
                ? <button className="btn btn-sm btn-danger" onClick={() => window.confirm(`Disable ${x.fullName}? They are signed out immediately.`) && toggle(x.id, false)}>Disable</button>
                : <button className="btn btn-sm" onClick={() => toggle(x.id, true)}>Enable</button>}</div></td></tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ audit */
export function AuditPage() {
  const a = useLoad<{ occurredAt: string; actor: string; action: string; company: string; detail: string | null }[]>("/platform/audit");
  return (
    <div className="stack">
      <ConsoleHeader title="Audit log" subtitle="Every operator action in customer workspaces: suspensions, plan and trial changes, support sessions, approvals." />
      {a.error && <Alert tone="danger">{a.error}</Alert>}
      {!a.data ? <Loading /> : !a.data.length ? <div className="card"><div className="card-body muted">No operator actions yet.</div></div> : (
        <div className="card pc-table-wrap"><table className="table">
          <thead><tr><th>When</th><th>Operator</th><th>Action</th><th>Company</th><th>Details</th></tr></thead>
          <tbody>{a.data.map((x, i) => <tr key={i}><td>{dateTime(x.occurredAt)}</td><td>{x.actor.replace("OPES operator ", "")}</td><td><span className="badge tone-violet">{label(x.action)}</span></td><td>{x.company}</td><td className="small">{x.detail ?? ""}</td></tr>)}</tbody>
        </table></div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ health */
export function HealthPage() {
  const h = useLoad<Record<string, string | number>>("/platform/health");
  useEffect(() => { const t = setInterval(h.reload, 30000); return () => clearInterval(t); }, [h.reload]);
  if (h.error) return <Alert tone="danger">{h.error}</Alert>;
  if (!h.data) return <Loading />;
  const d = h.data;
  const mem = Math.round((Number(d.memoryUsedMb) / Number(d.memoryMaxMb)) * 100);
  return (
    <div className="stack">
      <ConsoleHeader title="System health" subtitle="The OPES Maintain application server. Refreshes every 30 seconds." />
      <div className="pc-kpis">
        <div className="pc-kpi"><Icon name="CircleCheck" size={18} /><b>Online</b><span>Status</span></div>
        <div className="pc-kpi"><Icon name="Timer" size={18} /><b>{d.uptime}</b><span>Uptime since {dateTime(String(d.startedAt))}</span></div>
        <div className="pc-kpi"><Icon name="MemoryStick" size={18} /><b>{mem}%</b><span>Memory ({d.memoryUsedMb} / {d.memoryMaxMb} MB)</span></div>
        <div className="pc-kpi"><Icon name="Database" size={18} /><b>{d.databaseSize}</b><span>Database size</span></div>
        <div className="pc-kpi"><Icon name="GitBranch" size={18} /><b>{d.schemaVersion}</b><span>Database schema</span></div>
        <div className="pc-kpi"><Icon name="BookOpen" size={18} /><b>{d.catalogVersion}</b><span>Master catalog</span></div>
        <div className="pc-kpi"><Icon name="Cpu" size={18} /><b>{d.processors}</b><span>CPU cores · Java {d.javaVersion}</span></div>
        <div className="pc-kpi"><Icon name="Clock" size={18} /><b>{new Date(String(d.serverTime)).toLocaleTimeString()}</b><span>Server time</span></div>
      </div>
    </div>
  );
}
