"use client";
import { useState } from "react";
import { BarList, ColumnChart, Ring } from "@/components/charts";
import { ErrorState, Loading, PageHeader, Stat, useData } from "@/components/ui";
import { api } from "@/lib/api";
import { date, humanize, money, num } from "@/lib/format";
import { useT } from "@/lib/i18n";

type Kpi = { value: number | null; numerator: number; denominator: number; formula: string };

export default function Analytics() {
  const t = useT();
  const [days, setDays] = useState(90);
  const [site, setSite] = useState("");
  const sites = useData(() => api<{ id: string; label: string }[]>("/sites/options"), []);
  const { data: k, error, reload } = useData(() => api<Record<string, unknown>>(`/kpis?days=${days}${site ? `&siteId=${site}` : ""}`), [days, site]);
  const kpi = (n: string) => k?.[n] as Kpi;
  return (
    <>
      <PageHeader icon="ChartLine" title={t("Analytics")} subtitle="Reliability and maintenance performance. Each KPI shows its formula, numerator and denominator."
        actions={<>
          <select className="select" style={{ width: 200 }} value={site} onChange={(e) => setSite(e.target.value)} aria-label="Site"><option value="">All sites</option>{(sites.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
          <select className="select" style={{ width: 150 }} value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">{[30, 90, 180, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}</select>
        </>} />
      {error ? <ErrorState error={error} onRetry={reload} /> : !k ? <Loading /> : (
        <div className="stack">
          <div className="grid grid-4">
            {[["pmCompliancePct", "PM compliance"], ["availabilityPct", "Availability"], ["plannedWorkPct", "Planned work ratio"], ["slaBreachPct", "SLA breach rate"]].map(([key, label]) => (
              <div className="card stat" key={key} style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <Ring value={kpi(key).value} label={label} />
                <div style={{ minWidth: 0 }}><div className="label">{label}</div><div className="small muted" title={kpi(key).formula}>{kpi(key).formula}</div><div className="small muted">{num(kpi(key).numerator, 1)} / {num(kpi(key).denominator, 1)}</div></div>
              </div>
            ))}
          </div>
          <div className="grid grid-4">
            <Stat label="MTTR" value={kpi("mttrHours").value === null ? "—" : `${num(kpi("mttrHours").value, 1)} h`} meta={`${num(kpi("mttrHours").denominator, 0)} repairs`} icon="Timer" />
            <Stat label="MTBF" value={kpi("mtbfHours").value === null ? "—" : `${num(kpi("mtbfHours").value, 0)} h`} meta={`${num(kpi("mtbfHours").denominator, 0)} unplanned failures`} icon="Activity" />
            <Stat label="Downtime" value={`${num(k.downtimeHours, 1)} h`} meta="All assets in scope" icon="TriangleAlert" />
            <Stat label="Closed work orders" value={num(k.closedCount, 0)} meta={`Backlog ${num(k.backlog, 0)}`} icon="CircleCheck" />
          </div>
          <div className="grid grid-3">
            <div className="card span-2"><div className="card-head"><h2>Created vs completed</h2></div><div className="card-body">
              <ColumnChart data={(k.weeklyTrend as { week: string; created: number; completed: number }[]).map((w) => ({ label: date(w.week).replace(/\s?\d{4}$/, ""), values: [w.created, w.completed] }))} series={[{ name: "Created", color: "var(--accent)" }, { name: "Completed", color: "var(--ok)" }]} />
            </div></div>
            <div className="card"><div className="card-head"><h2>Work orders by status</h2></div><div className="card-body">
              <BarList items={Object.entries(k.workOrdersByStatus as Record<string, number>).map(([n, v]) => ({ name: humanize(n), value: v }))} format={(v) => num(v, 0)} />
            </div></div>
          </div>
          <div className="grid grid-2">
            <div className="card"><div className="card-head"><h2>Downtime by asset</h2><span className="small muted">Top 8, hours</span></div><div className="card-body">
              <BarList items={(k.downtimeByAsset as { asset: string; hours: number }[]).map((d) => ({ name: d.asset, value: Number(d.hours) }))} unit="h" />
            </div></div>
            <div className="card"><div className="card-head"><h2>Maintenance cost by site</h2><span className="small muted">Closed work, labor + parts</span></div><div className="card-body">
              <BarList items={Object.entries(k.costBySite as Record<string, number>).map(([n, v]) => ({ name: n, value: Number(v) }))} format={(v) => money(v)} />
            </div></div>
          </div>
        </div>
      )}
    </>
  );
}
