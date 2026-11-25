"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Alert } from "@/components/ui";
import { api } from "@/lib/api";
import { Icon } from "@/lib/icons";

function ResetForm() {
  const sp = useSearchParams();
  const token = sp.get("token") ?? "";
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw !== pw2) { setError("The two passwords do not match."); return; }
    setBusy(true);
    setError(null);
    try {
      await api("/auth/reset-password", { body: { token, password: pw } });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-form" style={{ minHeight: "100vh" }}>
      <div className="auth-card stack">
        <div className="row"><div className="brand-mark">OM</div><div className="brand-name">OPES Maintain</div></div>
        <h1>Choose a new password</h1>
        {!token && <Alert tone="danger">This link is incomplete. Request a new reset link.</Alert>}
        {error && <Alert tone="danger">{error}</Alert>}
        {done ? (
          <>
            <Alert tone="ok">Your password has been changed and you were signed out on other devices.</Alert>
            <Link href="/login" className="btn btn-primary big-btn"><Icon name="Lock" size={16} />Sign in</Link>
          </>
        ) : token && (
          <form className="stack" onSubmit={submit}>
            <div className="field"><label htmlFor="pw">New password</label><input id="pw" className="input" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} />
              <span className="hint">At least 10 characters with letters and digits.</span></div>
            <div className="field"><label htmlFor="pw2">Confirm new password</label><input id="pw2" className="input" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
            <button className="btn btn-primary big-btn" disabled={busy || !pw || !pw2}><Icon name="Save" size={16} />{busy ? "Saving…" : "Change password"}</button>
          </form>
        )}
        <Link href="/forgot-password" className="small">Request a new link</Link>
      </div>
    </main>
  );
}

export default function ResetPassword() {
  return <Suspense><ResetForm /></Suspense>;
}
