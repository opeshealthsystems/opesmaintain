"use client";
import Link from "next/link";
import { useState } from "react";
import { Badge, ErrorState, Loading, PageHeader, useData } from "@/components/ui";
import { api, type Page } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, humanize } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { Icon } from "@/lib/icons";

const LANES = ["DRAFT", "TRIAGED", "APPROVED", "PLANNED", "DISPATCHED", "IN_PROGRESS", "ON_HOLD", "WORK_COMPLETED", "REVIEWED"];

export default function WorkBoard() {
  const t = useT();
  const { canWrite } = useAuth();
  const [site, setSite] = useState("");
  const [type, setType] = useState("");
  const q = new URLSearchParams({ status: LANES.join(","), size: "300", sort: "dueAt,asc" });
  if (site) q.set("siteId", site);
  if (type) q.set("workType", type);
  const { data, error, loading, reload } = useData(() => api<Page>(`/work-orders?${q}`), [site, type]);
  const sites = useData(() => api<{ id: string; label: string }[]>("/sites/options"), []);
  return (
    <>
      <PageHeader icon="SquareKanban" title={t("Work board")} subtitle="Active work orders by lifecycle stage. Open a card to move it through its guarded transitions."
        actions={<>
          <select className="select" style={{ width: 200 }} value={site} onChange={(e) => setSite(e.target.value)} aria-label="Site"><option value="">All sites</option>{(sites.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
          <select className="select" style={{ width: 170 }} value={type} onChange={(e) => setType(e.target.value)} aria-label="Work type"><option value="">All types</option>{["CORRECTIVE", "PREVENTIVE", "EMERGENCY", "INSPECTION", "CALIBRATION"].map((x) => <option key={x} value={x}>{humanize(x)}</option>)}</select>
          <button className="btn icon-btn" onClick={reload} aria-label="Refresh"><Icon name="RefreshCw" size={16} /></button>
          {canWrite("work-orders") && <Link className="btn btn-primary" href="/m/work-orders/new"><Icon name="Plus" size={16} />New</Link>}
        </>} />
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <Loading /> : (
        <div className="board">
          {LANES.map((lane) => {
            const items = data!.items.filter((w) => w.status === lane);
            return (
              <section className="lane" key={lane} aria-label={humanize(lane)}>
                <div className="lane-head"><span>{humanize(lane)}</span><span className="badge plain tone-neutral">{items.length}</span></div>
                <div className="lane-body">
                  {items.length === 0 && <div className="small muted" style={{ padding: 8 }}>No work orders</div>}
                  {items.map((w) => {
                    const overdue = w.dueAt && new Date(String(w.dueAt)) < new Date();
                    return (
                      <Link key={w.id} href={`/m/work-orders/${w.id}`} className="tile">
                        <div className="row between" style={{ flexWrap: "nowrap" }}><span className="small mono muted">{String(w.number)}</span><Badge value={w.priority} /></div>
                        <div className="t">{String(w.title)}</div>
                        {w.assetIdLabel ? <div className="small muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><Icon name="Boxes" size={12} /> {String(w.assetIdLabel)}</div> : null}
                        <div className="row between small" style={{ flexWrap: "nowrap" }}>
                          <span className="muted"><Icon name="UserRound" size={12} /> {w.assigneeIdLabel ? String(w.assigneeIdLabel) : "Unassigned"}</span>
                          <span style={{ color: overdue ? "var(--danger)" : "var(--text-3)" }}><Icon name="Clock" size={12} /> {date(w.dueAt)}</span>
                        </div>
                        {w.slaBreached === true && <Badge value="BREACHED" tone="tone-danger" />}
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
