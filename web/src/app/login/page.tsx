"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Alert } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/lib/icons";

const DEMO = [
  ["admin@opes.demo", "Administrator"], ["manager@opes.demo", "Maintenance manager"], ["planner@opes.demo", "Planner"],
  ["dispatcher@opes.demo", "Dispatcher"], ["tech@opes.demo", "Technician"], ["stores@opes.demo", "Storekeeper"],
  ["safety@opes.demo", "Safety officer"], ["calibration@opes.demo", "Calibration officer"], ["commercial@opes.demo", "Commercial"],
  ["procurement@opes.demo", "Procurement"], ["auditor@opes.demo", "Auditor (read-only)"], ["customer@opes.demo", "Customer portal"],
];

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [needCode, setNeedCode] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = await login(email, password, needCode ? code : undefined);
      if (u.mfaEnrollmentRequired) { router.replace("/settings?mfa=1"); return; }
      const next = sp.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : u.role === "CUSTOMER" ? "/portal" : u.role === "TECHNICIAN" ? "/technician" : "/");
    } catch (err) {
      const e2 = err as { code?: string; message: string };
      if (e2.code === "MFA_REQUIRED") { setNeedCode(true); setError(null); }
      else setError(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <section className="auth-side">
        <div className="row"><div className="brand-mark">OM</div><div><div className="brand-name">OPES Maintain</div><div className="brand-sub">by OPES Health Systems</div></div></div>
        <div className="stack" style={{ maxWidth: 460 }}>
          <h1 style={{ fontSize: 26 }}>Maintenance operations, from request to sign-off.</h1>
          <p className="muted">Asset registry, work orders, preventive maintenance, spare parts, permits, calibration and reliability analytics — in one auditable platform.</p>
          <div className="stack" style={{ gap: 10, marginTop: 8 }}>
            {[["ShieldCheck", "Tenant-isolated, role-scoped access with full audit trail"], ["CalendarClock", "Calendar and meter-based preventive maintenance"], ["Smartphone", "Offline-capable technician workflow"], ["ChartLine", "MTTR, MTBF, availability, PM compliance and SLA KPIs"]].map(([i, t]) => (
              <div className="row" key={t} style={{ flexWrap: "nowrap" }}><Icon name={i} size={18} style={{ color: "var(--accent)", flex: "0 0 auto" }} /><span>{t}</span></div>
            ))}
          </div>
        </div>
        <div className="small muted">© {new Date().getFullYear()} OPES Health Systems</div>
      </section>
      <section className="auth-form">
        <div className="auth-card stack">
          <div><h1>Sign in</h1><p className="muted">Use your organization account.</p></div>
          {error && <Alert tone="danger">{error}</Alert>}
          <form className="stack" onSubmit={submit}>
            <div className="field"><label htmlFor="email">Email</label><input id="email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="field"><label htmlFor="password">Password</label><input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            {needCode && (
              <div className="field"><label htmlFor="code">Authenticator code</label>
                <input id="code" className="input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
                <span className="hint">Enter the 6-digit code from your authenticator app.</span></div>
            )}
            <button className="btn btn-primary big-btn" disabled={busy}><Icon name="Lock" size={16} />{busy ? "Signing in…" : "Sign in"}</button>
          </form>
          <Link href="/forgot-password" className="small" style={{ alignSelf: "flex-start" }}>Forgot password?</Link>
          <div className="card">
            <div className="card-head"><h3>Demo accounts</h3><span className="small muted">Password: OpesDemo2026</span></div>
            <div className="card-body demo-users">
              {DEMO.map(([e, r]) => (
                <button key={e} type="button" className="btn btn-sm" onClick={() => { setEmail(e); setPassword("OpesDemo2026"); }} title={e}>{r}</button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
