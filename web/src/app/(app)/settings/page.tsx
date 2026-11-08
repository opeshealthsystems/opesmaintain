"use client";
import Link from "next/link";
import { useState } from "react";
import { Alert, PageHeader, useData, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { humanize } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { Icon } from "@/lib/icons";

export default function Settings() {
  const t = useT();
  const toast = useToast();
  const { user, setLanguage, hasRole } = useAuth();
  const tenant = useData(() => api<Record<string, string>>("/tenant"), []);
  const [tf, setTf] = useState<Record<string, string> | null>(null);
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [pwErr, setPwErr] = useState<string | null>(null);
  const tv = tf ?? tenant.data ?? {};
  const saveTenant = async () => {
    try { await api("/tenant", { method: "PATCH", body: tv }); toast("Organization settings saved"); tenant.reload(); setTf(null); } catch (e) { toast((e as Error).message, "err"); }
  };
  const changePw = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwErr(null);
    try { await api("/me:change-password", { body: pw }); toast("Password changed"); setPw({ currentPassword: "", newPassword: "" }); } catch (err) { setPwErr((err as Error).message); }
  };
  return (
    <>
      <PageHeader icon="Settings" title={t("Settings")} subtitle="Profile, organization and platform configuration." />
      <div className="grid grid-2">
        <div className="card">
          <div className="card-head"><h2>{t("Profile")}</h2></div>
          <div className="card-body stack">
            <dl className="dl" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))", margin: "-16px" }}>
              <div><dt>Name</dt><dd>{user?.fullName}</dd></div><div><dt>Email</dt><dd>{user?.email}</dd></div>
              <div><dt>Role</dt><dd>{humanize(user?.role ?? "")}</dd></div><div><dt>Organization</dt><dd>{user?.tenantName}</dd></div>
            </dl>
            <div className="field"><label htmlFor="lang">{t("Language")}</label>
              <select id="lang" className="select" value={user?.language} onChange={(e) => setLanguage(e.target.value)}><option value="EN">English</option><option value="FR">Français</option></select></div>
          </div>
        </div>
        <form className="card" onSubmit={changePw}>
          <div className="card-head"><h2>{t("Password")}</h2></div>
          <div className="card-body stack">
            {pwErr && <Alert tone="danger">{pwErr}</Alert>}
            <div className="field"><label htmlFor="cp">Current password</label><input id="cp" type="password" className="input" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></div>
            <div className="field"><label htmlFor="np">New password</label><input id="np" type="password" className="input" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /><span className="hint">At least 10 characters with letters and digits.</span></div>
          </div>
          <div className="card-foot"><span /><button className="btn btn-primary" disabled={!pw.currentPassword || !pw.newPassword}><Icon name="Save" size={16} />Change password</button></div>
        </form>
        <div className="card">
          <div className="card-head"><h2>Organization</h2>{!hasRole("ADMIN") && <span className="small muted">Read-only</span>}</div>
          <div className="card-body form-grid">
            {[["legalName", "Legal name"], ["country", "Country"], ["timeZone", "Time zone (IANA)"], ["currency", "Currency"], ["language", "Default language"], ["plan", "Plan"]].map(([k, l]) => (
              <div className="field" key={k}><label htmlFor={`t-${k}`}>{l}</label>
                <input id={`t-${k}`} className="input" value={tv[k] ?? ""} disabled={!hasRole("ADMIN") || k === "plan"} onChange={(e) => setTf({ ...tv, [k]: e.target.value })} /></div>
            ))}
          </div>
          {hasRole("ADMIN") && <div className="card-foot"><span className="small muted">Changes are audited.</span><button className="btn btn-primary" onClick={saveTenant} disabled={!tf}><Icon name="Save" size={16} />Save</button></div>}
        </div>
        <div className="card">
          <div className="card-head"><h2>Administration</h2></div>
          <div className="card-body stack" style={{ gap: 6 }}>
            {[["/m/users", "UserRound", "Users & roles"], ["/m/delegations", "UserCheck", "Delegations"], ["/m/devices", "Smartphone", "Devices"], ["/m/settings", "SlidersHorizontal", "Configuration values"],
              ["/m/sla-policies", "Timer", "SLA policies"], ["/m/failure-codes", "Tags", "Failure codes"], ["/m/inspection-templates", "ClipboardCheck", "Inspection templates"], ["/m/integrations", "Plug", "Integrations"],
              ["/m/webhook-subscriptions", "Webhook", "Webhooks"], ["/m/audit-events", "ScrollText", "Audit trail"], ["/m/outbox-events", "Send", "Event outbox"]].map(([h, i, l]) => (
              <Link key={h} href={h} className="search-item" style={{ borderRadius: 6 }}><Icon name={i} size={16} />{l}<Icon name="ChevronRight" size={14} style={{ marginLeft: "auto" }} /></Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
