"use client";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Icon } from "@/lib/icons";
import { humanize } from "@/lib/format";

const OK = /^(ACTIVE|CLOSED|COMPLETED|DONE|PASS|APPROVED|ACCEPTED|ELIGIBLE|RECEIVED|ISSUED_OK|AVAILABLE|COMPLIANT|ONLINE|DELIVERED|ACKNOWLEDGED_OK|CLEAR|TRUSTED|PUBLISHED|POSTED|ENABLED|IN_USE|READ|CONVERTED|CURRENT|YES)$/;
const WARN = /^(ON_HOLD|PAUSED|DUE|WARNING|PARTIALLY_RECEIVED|SUSPENDED|RESTRICTED|PERMIT_REQUIRED|CONDITIONAL|HIGH|PENDING|UNDER_MAINTENANCE|SENT|SUBMITTED|OPEN|ON_JOB|INVESTIGATING|ACTIONS_ASSIGNED|RETRY|STAGED|SCANNING|PROSPECT|ON_HOLD_|AS_FOUND|ADJUSTED|AS_LEFT|IN_SERVICE)$/;
const DANGER = /^(CANCELLED|REJECTED|FAILED|FAIL|OVERDUE|CRITICAL|OUT_OF_SERVICE|QUARANTINED|LOCKED_OUT|REVOKED|EXPIRED|ALARM|DEAD_LETTER|OFFBOARDED|TERMINATED|DISPOSED|MAJOR|OFF_ROAD|ERROR|OFFLINE|BREACHED|NO)$/;
const INFO = /^(IN_PROGRESS|DISPATCHED|PLANNED|SCHEDULED|TRIAGED|ACKNOWLEDGED|VERIFIED|ISSUED|REVIEWED|WORK_COMPLETED|GENERATED|QUEUED|RUNNING|CLAIMED|MEDIUM|PROPOSED|DRAFT_|UNREAD|LEAD)$/;

export function toneOf(v: string): string {
  if (OK.test(v)) return "tone-ok";
  if (DANGER.test(v)) return "tone-danger";
  if (WARN.test(v)) return "tone-warn";
  if (INFO.test(v)) return "tone-info";
  if (/^(LOW|PLANNED_PRIORITY|MINOR|NEAR_MISS)$/.test(v)) return "tone-neutral";
  return "tone-neutral";
}

export function Badge({ value, plain, tone }: { value: unknown; plain?: boolean; tone?: string }) {
  if (value === null || value === undefined || value === "") return <span className="muted">—</span>;
  const v = String(value);
  return <span className={`badge ${plain ? "plain" : ""} ${tone ?? toneOf(v)}`}>{humanize(v)}</span>;
}

export function PageHeader({ icon, title, subtitle, actions, crumbs }: {
  icon?: string; title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; crumbs?: { href?: string; label: string }[];
}) {
  return (
    <>
      {crumbs && crumbs.length > 0 && (
        <nav className="crumbs" aria-label="Breadcrumb">
          {crumbs.map((c, i) => (
            <span key={i} className="row" style={{ gap: 6 }}>
              {c.href ? <Link href={c.href}>{c.label}</Link> : <span>{c.label}</span>}
              {i < crumbs.length - 1 && <Icon name="ChevronRight" size={13} />}
            </span>
          ))}
        </nav>
      )}
      <div className="page-head">
        <div className="title">
          {icon && <div className="title-icon"><Icon name={icon} size={20} /></div>}
          <div style={{ minWidth: 0 }}>
            <h1>{title}</h1>
            {subtitle && <div className="subtitle">{subtitle}</div>}
          </div>
        </div>
        {actions && <div className="actions">{actions}</div>}
      </div>
    </>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <div style={{ width: 220, display: "grid", gap: 8 }}>
        <div className="skeleton" /><div className="skeleton" style={{ width: "80%" }} /><div className="skeleton" style={{ width: "60%" }} />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function Empty({ title = "No records found", hint, icon = "Inbox", action }: { title?: string; hint?: string; icon?: string; action?: React.ReactNode }) {
  return (
    <div className="state">
      <Icon name={icon} size={28} />
      <div className="t">{title}</div>
      {hint && <div className="small">{hint}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error as { status?: number; message?: string };
  const unauthorized = e?.status === 403;
  const offline = e?.status === 0;
  return (
    <div className="state">
      <Icon name={unauthorized ? "Lock" : offline ? "WifiOff" : "CircleAlert"} size={28} />
      <div className="t">{unauthorized ? "You do not have access to this view" : offline ? "You are offline" : e?.status === 404 ? "Not found" : "Something went wrong"}</div>
      <div className="small">{e?.message ?? "Unexpected error"}</div>
      {onRetry && !unauthorized && <button className="btn btn-sm" onClick={onRetry}><Icon name="RefreshCw" size={14} />Retry</button>}
    </div>
  );
}

export function Alert({ tone = "info", children, icon }: { tone?: "info" | "warn" | "danger" | "ok"; children: React.ReactNode; icon?: string }) {
  const ic = icon ?? (tone === "danger" ? "CircleAlert" : tone === "warn" ? "TriangleAlert" : tone === "ok" ? "CircleCheck" : "Info");
  return <div className={`alert tone-${tone}`} role={tone === "danger" ? "alert" : "status"}><Icon name={ic} size={16} style={{ marginTop: 2, flex: "0 0 auto" }} /><div>{children}</div></div>;
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("input, select, textarea, button");
    first?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus(); };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref} style={wide ? { maxWidth: 820 } : undefined}>
        <div className="modal-head"><h2>{title}</h2><button className="btn btn-ghost icon-btn" onClick={onClose} aria-label="Close"><Icon name="X" /></button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

interface ToastMsg { id: number; text: string; kind: "ok" | "err" | "info" }
const ToastCtx = createContext<(text: string, kind?: "ok" | "err" | "info") => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastMsg[]>([]);
  const push = useCallback((text: string, kind: "ok" | "err" | "info" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === "err" ? 7000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <Icon name={t.kind === "err" ? "CircleAlert" : t.kind === "ok" ? "CircleCheck" : "Info"} size={16} style={{ marginTop: 2, flex: "0 0 auto" }} />
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

export function Stat({ label, value, meta, icon, href, tone }: { label: string; value: React.ReactNode; meta?: React.ReactNode; icon?: string; href?: string; tone?: string }) {
  const inner = (
    <>
      <div className="label">{icon && <Icon name={icon} size={15} />}{label}</div>
      <div className="value" style={tone ? { color: `var(--${tone})` } : undefined}>{value}</div>
      {meta && <div className="meta">{meta}</div>}
    </>
  );
  return href ? <Link href={href} className="card stat">{inner}</Link> : <div className="card stat">{inner}</div>;
}

/** Simple data hook with loading/error/reload for client pages. */
export function useData<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    loader().then((d) => { if (alive) setData(d); }).catch((e) => { if (alive) setError(e); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, loading, reload: () => setTick((t) => t + 1), setData };
}
