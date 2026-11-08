"use client";
import Link from "next/link";
import { Badge, ErrorState, Loading, PageHeader, useData } from "@/components/ui";
import { api, type Page } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, dateTime, humanize, num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { Icon } from "@/lib/icons";

const LANES = ["DRAFT", "APPROVED", "ACTIVE", "PAUSED", "RETIRED"];

export default function PmBoard() {
  const t = useT();
  const { canWrite } = useAuth();
  const plans = useData(() => api<Page>("/pm-plans?size=300&sort=nextDueAt,asc"), []);
  const occ = useData(() => api<Page>("/pm-occurrences?size=20&sort=dueAt,desc"), []);
  return (
    <>
      <PageHeader icon="CalendarClock" title={t("PM board")} subtitle="Preventive maintenance plans by lifecycle, with the latest generated occurrences."
        actions={canWrite("pm-plans") ? <Link className="btn btn-primary" href="/m/pm-plans/new"><Icon name="Plus" size={16} />New PM plan</Link> : undefined} />
      {plans.error ? <ErrorState error={plans.error} onRetry={plans.reload} /> : !plans.data ? <Loading /> : (
        <div className="stack">
          <div className="board">
            {LANES.map((lane) => {
              const items = plans.data!.items.filter((p) => p.status === lane);
              return (
                <section className="lane" key={lane}>
                  <div className="lane-head"><span>{humanize(lane)}</span><span className="badge plain tone-neutral">{items.length}</span></div>
                  <div className="lane-body">
                    {items.length === 0 && <div className="small muted" style={{ padding: 8 }}>No plans</div>}
                    {items.map((p) => {
                      const overdue = p.nextDueAt && new Date(String(p.nextDueAt)) < new Date();
                      return (
                        <Link key={p.id} href={`/m/pm-plans/${p.id}`} className="tile">
                          <div className="row between"><span className="small mono muted">{String(p.code)} · v{String(p.planVersion)}</span><Badge value={p.triggerType} plain tone="tone-info" /></div>
                          <div className="t">{String(p.name)}</div>
                          <div className="small muted"><Icon name="Boxes" size={12} /> {String(p.assetIdLabel)}</div>
                          <div className="small" style={{ color: overdue ? "var(--danger)" : "var(--text-3)" }}>
                            <Icon name="CalendarDays" size={12} /> {p.triggerType === "METER" ? `At ${num(p.nextMeterThreshold)} (meter)` : p.nextDueAt ? `Next due ${date(p.nextDueAt)}` : `Every ${p.intervalValue} ${humanize(String(p.intervalUnit)).toLowerCase()}(s)`}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
          <div className="card">
            <div className="card-head"><h2>Recently generated occurrences</h2><Link className="small" href="/m/pm-occurrences">All occurrences</Link></div>
            {!occ.data ? <Loading /> : occ.data.items.length === 0 ? <div className="state small">No occurrences generated yet.</div> : (
              <div className="table-wrap"><table className="table"><thead><tr><th>Plan</th><th>Key</th><th>Due (site time)</th><th>Work order</th><th>Status</th><th>Generated</th></tr></thead>
                <tbody>{occ.data.items.map((o) => (
                  <tr key={o.id}><td><Link href={`/m/pm-plans/${o.planId}`}>{String(o.planIdLabel)}</Link></td><td className="mono">{String(o.occurrenceKey)}</td><td>{String(o.localDue)}</td>
                    <td>{o.workOrderId ? <Link href={`/m/work-orders/${o.workOrderId}`}>{String(o.workOrderIdLabel)}</Link> : "—"}</td><td><Badge value={o.status} /></td><td>{dateTime(o.createdAt)}</td></tr>
                ))}</tbody></table></div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
