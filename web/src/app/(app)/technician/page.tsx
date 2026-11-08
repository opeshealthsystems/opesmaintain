"use client";
import Link from "next/link";
import { SyncBar, useOnline } from "@/components/SyncBar";
import { Badge, Empty, ErrorState, Loading, PageHeader, useData } from "@/components/ui";
import { api, type Page } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { Icon } from "@/lib/icons";
import { jobCache } from "@/lib/offline";

type R = Record<string, unknown>;

export default function TechnicianHome() {
  const t = useT();
  const online = useOnline();
  const { user } = useAuth();
  const { data, error, loading, reload } = useData(async () => {
    const mine = await api<{ technician: R | null; items: R[] }>("/technician/my-work");
    if (mine.technician) return mine;
    const all = await api<Page>("/work-orders?status=DISPATCHED,IN_PROGRESS,PLANNED,ON_HOLD&size=50&sort=dueAt,asc");
    return { technician: null, items: all.items as R[] };
  }, []);
  const cached = Object.values(jobCache.list());
  const items = data?.items ?? (!online ? cached : []);
  return (
    <div className="mobile-frame">
      <PageHeader icon="Smartphone" title={t("My work")} subtitle={data?.technician ? `${String((data.technician as R).fullName)} · ${String((data.technician as R).employeeNo)}` : `${user?.fullName} · team queue`} />
      <SyncBar onSynced={reload} />
      <div className="card">
        {loading && !data ? <Loading /> : error && online ? <ErrorState error={error} onRetry={reload} /> : items.length === 0 ? (
          <Empty title="No assigned work" hint="New dispatches appear here." icon="ClipboardList" />
        ) : items.map((w) => (
          <Link key={String(w.id)} href={`/technician/${w.id}`} className="job" style={{ color: "inherit", textDecoration: "none" }}>
            <div className="row between" style={{ flexWrap: "nowrap" }}><span className="small mono muted">{String(w.number)}</span><Badge value={w.status} /></div>
            <div style={{ fontWeight: 600 }}>{String(w.title)}</div>
            <div className="small muted"><Icon name="Boxes" size={12} /> {String(w.assetIdLabel ?? "No asset")}</div>
            <div className="row between small"><Badge value={w.priority} /><span className="muted"><Icon name="Clock" size={12} /> Due {dateTime(w.dueAt)}</span></div>
            {w.permitRequired === true && <div className="small" style={{ color: "var(--warn)" }}><Icon name="HardHat" size={12} /> Permit required — online check before start</div>}
          </Link>
        ))}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <Link className="btn" href="/m/maintenance-requests/new"><Icon name="TriangleAlert" size={16} />Report a fault</Link>
        <Link className="btn" href="/scan"><Icon name="ScanLine" size={16} />Scan asset</Link>
      </div>
    </div>
  );
}
