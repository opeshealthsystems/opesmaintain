"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { BarList, ColumnChart } from "@/components/charts";
import { RecordTable } from "@/components/ResourceList";
import { Badge, Empty, ErrorState, Loading, PageHeader, Stat, useData } from "@/components/ui";
import { api, type Page } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, humanize, money, num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { Icon } from "@/lib/icons";
import { resource } from "@/lib/registry";

type K = Record<string, unknown> & { [k: string]: never | unknown };
const kv = (k: K, key: string) => (k[key] as { value: number | null })?.value ?? null;

export default function Dashboard() {
  const t = useT();
  const router = useRouter();
  const { user, canWrite } = useAuth();
  useEffect(() => { if (user?.role === "CUSTOMER") router.replace("/portal"); }, [user, router]);
  const kpis = useData(() => (user?.scoped ? Promise.resolve(null as unknown as K) : api<K>("/kpis?days=90")), [user?.scoped]);
  const open = useData(() => api<Page>("/work-orders?status=DRAFT,TRIAGED,APPROVED,PLANNED,DISPATCHED,IN_PROGRESS,ON_HOLD&sort=dueAt,asc&size=8"), []);
  const insights = useData(() => api<Page>("/ai-insights?status=PROPOSED&size=5&sort=confidence,desc"), []);
  // contractors and customers never see tenant-wide KPIs
  const parts = useData(() => api<Page>("/parts?size=200"), []);
  if (user?.role === "CUSTOMER") return <Loading />;
  const k = kpis.data;
  const low = (parts.data?.items ?? []).filter((p) => p.reorderPoint !== null && Number(p.available) <= Number(p.reorderPoint)).slice(0, 6);
  const wo = resource("work-orders")!;

  return (
    <>
      <PageHeader icon="LayoutDashboard" title={`${t("Dashboard")}`} subtitle={`${user?.tenantName} · ${t("last 90 days")}`}
        actions={<>
          {canWrite("maintenance-requests") && <Link className="btn" href="/m/maintenance-requests/new"><Icon name="TriangleAlert" size={16} />{t("Report a fault")}</Link>}
          {canWrite("work-orders") && <Link className="btn btn-primary" href="/m/work-orders/new"><Icon name="Plus" size={16} />{t("New work order")}</Link>}
        </>} />
      {user?.scoped ? (
        <div className="card">
          <div className="card-head"><h2>{t("Open work orders by due date")}</h2><Link href="/technician" className="small">{t("My work")}</Link></div>
          {open.loading ? <Loading /> : open.data && open.data.items.length ? (
            <RecordTable def={wo} rows={open.data.items} columns={["number", "title", "priority", "status", "assigneeId", "dueAt"]} onOpen={(id) => router.push(`/m/work-orders/${id}`)} />
          ) : <Empty title={t("No open work")} hint="Only work at sites covered by your service grant is shown." icon="ClipboardList" />}
        </div>
      ) : kpis.error ? <ErrorState error={kpis.error} onRetry={kpis.reload} /> : !k ? <Loading /> : (
        <div className="stack">
          <div className="grid grid-4">
            <Stat icon="ClipboardList" label={t("Open work orders")} value={num(k.backlog, 0)} meta={`${num(k.emergencyOpen, 0)} emergency · ${num(k.slaAtRisk, 0)} SLA due ≤ 24 h`} href="/work-board" />
            <Stat icon="Clock" label={t("Overdue")} value={num(k.overdue, 0)} tone={Number(k.overdue) > 0 ? "danger" : undefined} meta={t("Past due date, not completed")} href="/m/work-orders?sort=dueAt,asc" />
            <Stat icon="Inbox" label={t("Open requests")} value={num(k.requestsOpen, 0)} meta={t("Submitted, acknowledged or triaged")} href="/m/maintenance-requests?status=SUBMITTED,ACKNOWLEDGED,TRIAGED" />
            <Stat icon="Boxes" label={t("Assets out of service")} value={num(k.assetsOutOfService, 0)} meta={`${num(k.assetCount, 0)} assets · ${num(k.assetsLockedOut, 0)} locked out`} href="/m/assets" />
          </div>
          <div className="grid grid-4">
            <Stat icon="Timer" label="MTTR" value={kv(k, "mttrHours") === null ? "—" : `${num(kv(k, "mttrHours"), 1)} h`} meta={t("Mean time to repair")} href="/analytics" />
            <Stat icon="Activity" label="MTBF" value={kv(k, "mtbfHours") === null ? "—" : `${num(kv(k, "mtbfHours"), 0)} h`} meta={t("Mean time between failures")} href="/analytics" />
            <Stat icon="CircleCheck" label={t("Availability")} value={kv(k, "availabilityPct") === null ? "—" : `${num(kv(k, "availabilityPct"), 1)}%`} meta={`${num(k.downtimeHours, 1)} h downtime`} href="/analytics" />
            <Stat icon="Wallet" label={t("Maintenance cost")} value={money(k.maintenanceCost)} meta={`Labor ${money(k.laborCost)} · parts ${money(k.partsCost)}`} href="/reports/COST_BY_SITE" />
          </div>
          <div className="grid grid-3">
            <div className="card span-2">
              <div className="card-head"><h2>{t("Work created vs completed")}</h2><span className="small muted">{t("Weekly, last 8 weeks")}</span></div>
              <div className="card-body">
                <ColumnChart data={(k.weeklyTrend as { week: string; created: number; completed: number }[]).map((w) => ({ label: date(w.week).replace(/\s?\d{4}$/, ""), values: [w.created, w.completed] }))}
                  series={[{ name: t("Created"), color: "var(--accent)" }, { name: t("Completed"), color: "var(--ok)" }]} />
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h2>{t("Open work by priority")}</h2></div>
              <div className="card-body">
                <BarList items={Object.entries(k.openByPriority as Record<string, number>).map(([n, v]) => ({ name: humanize(n), value: v }))} format={(v) => num(v, 0)} />
                <div className="small muted" style={{ marginTop: 12 }}>{t("By type")}</div>
                <BarList items={Object.entries(k.openByType as Record<string, number>).map(([n, v]) => ({ name: humanize(n), value: v }))} format={(v) => num(v, 0)} />
              </div>
            </div>
          </div>
          <div className="grid grid-3">
            <div className="card span-2">
              <div className="card-head"><h2>{t("Open work orders by due date")}</h2><Link href="/work-board" className="small">{t("Open work board")}</Link></div>
              {open.loading ? <Loading /> : open.data && open.data.items.length ? (
                <RecordTable def={wo} rows={open.data.items} columns={["number", "title", "priority", "status", "assigneeId", "dueAt"]} onOpen={(id) => router.push(`/m/work-orders/${id}`)} />
              ) : <Empty title={t("No open work")} icon="ClipboardList" />}
            </div>
            <div className="stack">
              <div className="card">
                <div className="card-head"><h2>{t("Recommendations")}</h2><Link href="/m/ai-insights" className="small">{t("All")}</Link></div>
                {insights.data && insights.data.items.length === 0 ? <Empty title={t("Nothing to review")} icon="Sparkles" /> : (insights.data?.items ?? []).map((i) => (
                  <Link key={i.id} href={`/m/ai-insights/${i.id}`} className="search-item" style={{ alignItems: "flex-start" }}>
                    <Icon name="Sparkles" size={16} style={{ marginTop: 2, color: "var(--violet)", flex: "0 0 auto" }} />
                    <div style={{ minWidth: 0 }}><div style={{ whiteSpace: "normal" }}>{String(i.title)}</div><div className="small muted">{humanize(String(i.insightType))} · {Math.round(Number(i.confidence) * 100)}% confidence</div></div>
                  </Link>
                ))}
              </div>
              <div className="card">
                <div className="card-head"><h2>{t("Low stock")}</h2><Link href="/stock" className="small">Stock control</Link></div>
                {low.length === 0 ? <Empty title={t("Stock levels healthy")} icon="PackageCheck" /> : low.map((p) => (
                  <Link key={p.id} href={`/m/parts/${p.id}`} className="search-item">
                    <Icon name="Package" size={16} />
                    <div style={{ flex: 1, minWidth: 0 }}><div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{String(p.name)}</div><div className="small muted">{String(p.partNo)} · reorder at {num(p.reorderPoint)}</div></div>
                    <Badge value={`${num(p.available)} ${String(p.unit)}`} tone={Number(p.available) <= 0 ? "tone-danger" : "tone-warn"} />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
