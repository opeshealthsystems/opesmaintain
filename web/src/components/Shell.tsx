"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { Icon } from "@/lib/icons";
import { GROUP_ORDER, modules, resources } from "@/lib/registry";
import { humanize, relative } from "@/lib/format";
import { Badge, Loading } from "./ui";
import { SupportBanner } from "./SupportBanner";
import { AnnouncementBanner } from "./AnnouncementBanner";

const OPS = [
  { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/work-board", label: "Work board", icon: "SquareKanban" },
  { href: "/dispatch", label: "Dispatch calendar", icon: "CalendarRange" },
  { href: "/pm-board", label: "PM board", icon: "CalendarClock" },
  { href: "/stock", label: "Stock control", icon: "Package" },
  { href: "/analytics", label: "Analytics", icon: "ChartLine" },
  { href: "/reports", label: "Reports", icon: "FileBarChart" },
  { href: "/technician", label: "Technician app", icon: "Smartphone" },
  { href: "/portal", label: "Customer portal", icon: "Globe" },
];

const CUSTOMER_NAV = [
  { href: "/portal", label: "Customer portal", icon: "Globe" },
  { href: "/m/assets", label: "My equipment", icon: "Boxes" },
  { href: "/m/maintenance-requests", label: "Service requests", icon: "Inbox" },
  { href: "/m/work-orders", label: "Service jobs", icon: "ClipboardList" },
  { href: "/m/quotes", label: "Quotations", icon: "Receipt" },
  { href: "/m/service-contracts", label: "Contracts", icon: "FileSignature" },
  { href: "/m/service-signoffs", label: "Sign-offs", icon: "Signature" },
  { href: "/m/billing-exports", label: "Billing", icon: "FileOutput" },
];

const APP_PAGES = ["/dashboard", "/work-board", "/dispatch", "/pm-board", "/stock", "/analytics", "/reports", "/technician", "/portal"];

/** True when the current URL is a page or module this role may not open (e.g. typed or bookmarked). */
function blocked(path: string, canRead: (p: string) => boolean, canOpen: (p: string) => boolean): boolean {
  const page = APP_PAGES.find((p) => path === p || path.startsWith(p + "/"));
  if (page) return !canOpen(page);
  const m = /^\/m\/([a-z-]+)/.exec(path);
  if (m) return !canRead(m[1]);
  if (path.startsWith("/reports")) return !canOpen("/reports");
  return false;
}

function NotAvailable({ label, back, home }: { label: string; back: string; home: string }) {
  return (
    <div className="card" style={{ maxWidth: 560, margin: "48px auto" }}>
      <div className="card-body stack" style={{ alignItems: "flex-start" }}>
        <Icon name="Lock" size={28} style={{ color: "var(--text-3)" }} />
        <h1 style={{ margin: 0 }}>{label}</h1>
        <Link href={home} className="btn btn-primary">{back}</Link>
      </div>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, setLanguage, canRead, canOpen } = useAuth();
  const t = useT();
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      setCollapsed(JSON.parse(window.localStorage.getItem("opes.nav") ?? "{}"));
    } catch { /* ignore */ }
  }, []);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [loading, user, router, path]);

  const toggle = (g: string) => {
    const next = { ...collapsed, [g]: !collapsed[g] };
    setCollapsed(next);
    try { window.localStorage.setItem("opes.nav", JSON.stringify(next)); } catch { /* ignore */ }
  };

  const groups = useMemo(() => {
    const m = new Map<string, typeof resources>();
    for (const r of resources) {
      if (!canRead(r.path)) continue; // same need-to-know rule the server enforces
      const g = modules[r.module].group;
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(r);
    }
    for (const list of m.values()) list.sort((a, b) => a.module.localeCompare(b.module));
    return GROUP_ORDER.filter((g) => m.has(g)).map((g) => ({ group: g, items: m.get(g)! }));
  }, [canRead]);

  if (loading || !user) return <div className="content"><Loading /></div>;
  const isCustomer = user.role === "CUSTOMER";
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? "open" : ""}`} aria-label="Main navigation">
        <div className="brand">
          <div className="brand-mark">OM</div>
          <div style={{ minWidth: 0 }}>
            <div className="brand-name">OPES Maintain</div>
            <div className="brand-sub" title={user.tenantName} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 170 }}>{user.tenantName}</div>
          </div>
          <button className="btn btn-ghost icon-btn menu-btn" style={{ marginLeft: "auto" }} onClick={() => setOpen(false)} aria-label="Close menu"><Icon name="X" /></button>
        </div>
        <nav className="nav">
          {isCustomer ? (
            CUSTOMER_NAV.map((n) => <NavLink key={n.href} {...n} label={t(n.label)} active={active(n.href)} />)
          ) : (
            <>
              <div className="nav-group-title" style={{ cursor: "default" }}>{t("Operations")}</div>
              {OPS.filter((n) => canOpen(n.href) && !(user.scoped && ["/analytics", "/reports", "/portal"].includes(n.href))).map((n) => <NavLink key={n.href} {...n} label={t(n.label)} active={active(n.href)} />)}
              {groups.map(({ group, items }) => (
                <div className="nav-group" key={group}>
                  <button className="nav-group-title" onClick={() => toggle(group)} aria-expanded={!collapsed[group]}>
                    <span>{t(group)}</span>
                    <Icon name={collapsed[group] ? "ChevronRight" : "ChevronDown"} size={14} />
                  </button>
                  {!collapsed[group] && items.map((r) => (
                    <NavLink key={r.path} href={`/m/${r.path}`} icon={r.icon} label={r.label} active={active(`/m/${r.path}`)} />
                  ))}
                </div>
              ))}
              <div className="nav-group">
                <div className="nav-group-title" style={{ cursor: "default" }}>{t("Settings")}</div>
                <NavLink href="/modules" icon="LayoutGrid" label={t("All modules")} active={active("/modules")} />
                <NavLink href="/settings" icon="Settings" label={t("Settings")} active={active("/settings")} />
              </div>
            </>
          )}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Open menu"><Icon name="Menu" /></button>
          <GlobalSearch />
          <div className="topbar-spacer" />
          <button className="btn btn-ghost btn-sm hide-sm" onClick={() => setLanguage(user.language === "FR" ? "EN" : "FR")} aria-label={`${user.language === "FR" ? "FR" : "EN"} — ${t("Language")}`} title={t("Language")}>
            <Icon name="Languages" size={16} />{user.language === "FR" ? "FR" : "EN"}
          </button>
          <NotificationBell />
          <UserMenu name={user.fullName} role={user.role} onLogout={logout} />
        </header>
        <SupportBanner />
        <AnnouncementBanner />
        <main className="content" id="main">{blocked(path, canRead, canOpen) ? <NotAvailable label={t("This page is not available for your role.")} back={t("Back to dashboard")} home={user.role === "CUSTOMER" ? "/portal" : "/dashboard"} /> : children}</main>
      </div>
    </div>
  );
}

function NavLink({ href, icon, label, active }: { href: string; icon: string; label: string; active: boolean }) {
  return (
    <Link href={href} className={`nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
      <Icon name={icon} size={17} /><span>{label}</span>
    </Link>
  );
}

function GlobalSearch() {
  const t = useT();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ resource: string; resourceLabel: string; id: string; label: string; status?: string }[] | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); return; }
    const h = setTimeout(() => {
      api<typeof results>(`/search?q=${encodeURIComponent(q.trim())}`).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(h);
  }, [q]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setResults(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <div className="search" ref={box}>
      <Icon name="Search" size={16} />
      <input className="input" placeholder={t("Search records…")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("Search")} />
      {results && (
        <div className="search-results">
          {results.length === 0 ? <div className="state small">No matches</div> : results.map((r) => (
            <Link key={r.resource + r.id} href={`/m/${r.resource}/${r.id}`} className="search-item" onClick={() => { setResults(null); setQ(""); }}>
              <Icon name={resources.find((x) => x.path === r.resource)?.icon ?? "Circle"} size={16} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</div>
                <div className="small muted">{r.resourceLabel}</div>
              </div>
              {r.status && <Badge value={r.status} />}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationBell() {
  const [items, setItems] = useState<{ id: string; subject: string; body: string; link: string; status: string; createdAt: string }[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const load = () => api<typeof items>("/notifications/mine").then(setItems).catch(() => {});
    load();
    const h = setInterval(load, 60000);
    return () => clearInterval(h);
  }, []);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const unread = items.filter((i) => i.status === "UNREAD").length;
  const markRead = (id: string) => {
    api(`/notifications/${id}:read`, { method: "POST" }).catch(() => {});
    setItems((x) => x.map((i) => (i.id === id ? { ...i, status: "READ" } : i)));
  };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="btn btn-ghost icon-btn" onClick={() => setOpen(!open)} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open}>
        <Icon name="Bell" />
        {unread > 0 && <span style={{ position: "absolute", top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, background: "var(--danger)", color: "#fff", fontSize: 10, fontWeight: 700, display: "grid", placeItems: "center", padding: "0 4px" }}>{unread}</span>}
      </button>
      {open && (
        <div className="search-results" style={{ left: "auto", right: 0, width: 360, maxWidth: "calc(100vw - 24px)" }}>
          <div className="card-head"><h3>Notifications</h3><Link href="/notifications" className="small" onClick={() => setOpen(false)}>View all</Link></div>
          {items.length === 0 ? <div className="state small">You are all caught up</div> : items.slice(0, 8).map((n) => (
            <Link key={n.id} href={n.link || "#"} className="search-item" onClick={() => { markRead(n.id); setOpen(false); }}>
              <Icon name={n.status === "UNREAD" ? "CircleDot" : "Circle"} size={14} style={{ color: n.status === "UNREAD" ? "var(--accent)" : "var(--text-3)", flex: "0 0 auto" }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: n.status === "UNREAD" ? 600 : 400 }}>{n.subject}</div>
                <div className="small muted" style={{ whiteSpace: "normal" }}>{n.body}</div>
                <div className="small muted">{relative(n.createdAt)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu({ name, role, onLogout }: { name: string; role: string; onLogout: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("");
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="btn btn-ghost" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" style={{ gap: 8, paddingRight: 6 }}>
        <span style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent)", display: "grid", placeItems: "center", fontWeight: 600, fontSize: 12 }}>{initials}</span>
        <span className="hide-sm" style={{ textAlign: "left", lineHeight: 1.15 }}>
          <span style={{ display: "block", fontSize: 13 }}>{name}</span>
          <span className="small muted">{humanize(role)}</span>
        </span>
        <Icon name="ChevronDown" size={14} />
      </button>
      {open && (
        <div className="search-results" style={{ left: "auto", right: 0, width: 220 }}>
          <Link href="/settings" className="search-item" onClick={() => setOpen(false)}><Icon name="UserCog" size={16} />{t("Profile")}</Link>
          <Link href="/notifications" className="search-item" onClick={() => setOpen(false)}><Icon name="Bell" size={16} />{t("Notifications")}</Link>
          <button className="search-item" style={{ width: "100%", border: 0, background: "none", font: "inherit", cursor: "pointer" }} onClick={onLogout}><Icon name="LogOut" size={16} />{t("Sign out")}</button>
        </div>
      )}
    </div>
  );
}
