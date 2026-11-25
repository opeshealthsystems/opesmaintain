"use client";
import Link from "next/link";
import { useState } from "react";
import { Alert } from "@/components/ui";
import { api } from "@/lib/api";
import { Icon } from "@/lib/icons";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/forgot-password", { body: { email } });
      setSent(true);
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
        <div><h1>Reset your password</h1><p className="muted">Enter your account e-mail. We will send you a link to choose a new password.</p></div>
        {error && <Alert tone="danger">{error}</Alert>}
        {sent ? (
          <Alert tone="ok">If an account exists for this address, a reset link has been sent. The link is valid for 30 minutes.</Alert>
        ) : (
          <form className="stack" onSubmit={submit}>
            <div className="field"><label htmlFor="email">Email</label><input id="email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <button className="btn btn-primary big-btn" disabled={busy || !email}><Icon name="Send" size={16} />{busy ? "Sending…" : "Send reset link"}</button>
          </form>
        )}
        <Link href="/login" className="small"><Icon name="ChevronLeft" size={14} /> Back to sign in</Link>
      </div>
    </main>
  );
}
