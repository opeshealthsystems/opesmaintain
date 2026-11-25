"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loading } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/lib/icons";

type Counters = { openTickets: number; overdueInvoices: number; pendingSignups: number };

const NAV: { group: string; items: { href: string; label: string; icon: string; counter?: keyof Counters }[] }[] = [
  { group: "Overview", items: [{ href: "/platform", label: "Dashboard", icon: "LayoutDashboard" }] },
  { group: "Customers", items: [
    { href: "/platform/companies", label: "Companies", icon: "Building2" },
    { href: "/platform/signups", label: "Sign-ups", icon: "UserPlus", counter: "pendingSignups" },
  ] },
  { group: "Support", items: [
    { href: "/platform/tickets", label: "Support desk", icon: "LifeBuoy", counter: "openTickets" },
    { href: "/platform/announcements", label: "Announcements", icon: "Megaphone" },
  ] },
  { group: "Revenue", items: [{ href: "/platform/billing", label: "Billing & invoices", icon: "Receipt", counter: "overdueInvoices" }] },
  { group: "Platform", items: [
    { href: "/platform/operators", label: "Operators", icon: "ShieldCheck" },
    { href: "/platform/audit", label: "Audit log", icon: "ScrollText" },
    { href: "/platform/health", label: "System health", icon: "Activity" },
  ] },
];

/** Operator console frame: sidebar with live counters, top bar, mobile menu. Non-operators see "page not found". */
export function ConsoleShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [counters, setCounters] = useState<Counters | null>(null);

  useEffect(() => { if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(path)}`); }, [loading, user, router, path]);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!user?.platformOperator) return;
    const load = () => api<Counters>("/platform/counters").then(setCounters).catch(() => undefined);
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [user, path]);

  if (loading || !user) return <div className="pc"><Loading /></div>;
  if (!user.platformOperator) {
    return (
      <div className="pc pc-denied"><div className="card"><div className="card-body stack">
        <h1 style={{ margin: 0 }}>Page not found</h1><Link className="btn" href="/dashboard">Back to dashboard</Link>
      </div></div></div>
    );
  }
  const active = (href: string) => (href === "/platform" ? path === "/platform" : path === href || path.startsWith(href + "/"));
  return (
    <div className="pc-shell">
      <aside className={`pc-side ${open ? "open" : ""}`} aria-label="Operator navigation">
        <div className="pc-brand">
          <div className="brand-mark">OM</div>
          <div><b>OPES Maintain</b><span>Operator console</span></div>
          <button className="btn btn-ghost btn-sm pc-close" onClick={() => setOpen(false)} aria-label="Close menu"><Icon name="X" size={16} /></button>
        </div>
        <nav className="pc-nav">
          {NAV.map((g) => (
            <div key={g.group} className="pc-nav-group">
              <div className="pc-nav-title">{g.group}</div>
              {g.items.map((n) => {
                const c = n.counter && counters ? counters[n.counter] : 0;
                return (
                  <Link key={n.href} href={n.href} className={active(n.href) ? "active" : ""} aria-current={active(n.href) ? "page" : undefined}>
                    <Icon name={n.icon} size={17} /><span>{n.label}</span>{c ? <em className="pc-count">{c}</em> : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="pc-side-foot">
          <div className="pc-me"><Icon name="UserRound" size={16} /><div><b>{user.fullName}</b><span>{user.email}</span></div></div>
          <button className="btn btn-sm" onClick={logout}><Icon name="LogOut" size={14} />Sign out</button>
          <span className="pc-credit">Opesware Technologies</span>
        </div>
      </aside>
      {open && <div className="pc-scrim" onClick={() => setOpen(false)} />}
      <div className="pc-main-col">
        <header className="pc-top">
          <button className="btn btn-ghost btn-sm pc-menu" onClick={() => setOpen(true)} aria-label="Open menu"><Icon name="Menu" size={18} /></button>
          <span className="pc-top-title">{NAV.flatMap((g) => g.items).find((n) => active(n.href))?.label ?? "Operator console"}</span>
          <Link href="/" className="btn btn-ghost btn-sm"><Icon name="Globe" size={14} />Public site</Link>
        </header>
        <main id="main" className="pc-content">{children}</main>
      </div>
    </div>
  );
}

/** Page heading used on every console page. */
export function ConsoleHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="pc-head2">
      <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export const STATUS_TONE: Record<string, string> = {
  ACTIVE: "tone-ok", TRIAL: "tone-info", TRIAL_EXPIRED: "tone-warn", SUSPENDED: "tone-danger",
  OPEN: "tone-info", PENDING: "tone-warn", RESOLVED: "tone-ok", CLOSED: "tone-neutral",
  DRAFT: "tone-neutral", SENT: "tone-info", PAID: "tone-ok", OVERDUE: "tone-danger", VOID: "tone-neutral",
  LOW: "tone-neutral", NORMAL: "tone-info", HIGH: "tone-warn", URGENT: "tone-danger",
  INFO: "tone-info", WARNING: "tone-warn", MAINTENANCE: "tone-violet",
};
export const label = (s: string | null | undefined) => (s ? s.replace(/_/g, " ").toLowerCase() : "—");
export const day = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const dateTime = (s: string | null | undefined) => (s ? new Date(s).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
export const ago = (s: string | null | undefined) => {
  if (!s) return "never";
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 60) return m <= 1 ? "just now" : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
};
export const money = (n: number | string, cur: string) => `${new Intl.NumberFormat("fr-FR").format(Number(n)).replace(/ | /g, " ")} ${cur === "XAF" || cur === "XOF" ? "FCFA" : cur}`;
export function Badge({ v }: { v: string | null | undefined }) {
  return <span className={`badge ${STATUS_TONE[v ?? ""] ?? ""}`}>{label(v)}</span>;
}
