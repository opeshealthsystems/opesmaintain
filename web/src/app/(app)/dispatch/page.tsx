"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ActionRunner, type RunSpec } from "@/components/ActionRunner";
import { Badge, ErrorState, Loading, PageHeader, useData, useToast } from "@/components/ui";
import { api, type Page } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { humanize } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { Icon } from "@/lib/icons";

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export default function Dispatch() {
  const t = useT();
  const toast = useToast();
  const { hasRole } = useAuth();
  const [week, setWeek] = useState(() => startOfWeek(new Date()));
  const [run, setRun] = useState<RunSpec | null>(null);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(week); d.setDate(d.getDate() + i); return d; }), [week]);
  const end = days[6].getTime() + 86400000;
  const from = new Date(week.getTime() - 86400000).toISOString();
  const to = new Date(end).toISOString();
  const techs = useData(() => api<Page>("/technicians?size=200&sort=fullName,asc"), []);
  const asg = useData(() => api<Page>(`/assignments?size=500&scheduledStartFrom=${from}&scheduledStartTo=${to}`), [from, to]);
  const unassigned = useData(() => api<Page>("/work-orders?status=APPROVED,TRIAGED&assigneeId=null&size=50&sort=dueAt,asc"), []);
  const today = new Date().toDateString();
  const reload = () => { asg.reload(); unassigned.reload(); techs.reload(); };

  return (
    <>
      <PageHeader icon="CalendarRange" title={t("Dispatch calendar")} subtitle="Technician assignments for the week. Times shown in your local time zone."
        actions={<>
          <button className="btn icon-btn" onClick={() => setWeek(new Date(week.getTime() - 7 * 86400000))} aria-label="Previous week"><Icon name="ChevronLeft" size={16} /></button>
          <button className="btn" onClick={() => setWeek(startOfWeek(new Date()))}>This week</button>
          <button className="btn icon-btn" onClick={() => setWeek(new Date(week.getTime() + 7 * 86400000))} aria-label="Next week"><Icon name="ChevronRight" size={16} /></button>
          {hasRole("DISPATCHER", "PLANNER", "MANAGER") && <button className="btn btn-primary" onClick={() => setRun({ title: "New assignment", endpoint: "/assignments", fields: [
            { name: "workOrderId", label: "Work order", type: "ref", ref: "work-orders", required: true }, { name: "technicianId", label: "Technician", type: "ref", ref: "technicians", required: true },
            { name: "scheduledStart", label: "Start", type: "datetime", required: true }, { name: "scheduledEnd", label: "End", type: "datetime", required: true },
            { name: "role", label: "Role", type: "enum", options: ["LEAD", "SUPPORT"] }] })}><Icon name="Plus" size={16} />Assign</button>}
        </>} />
      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
        <div className="card">
          <div className="card-head"><h2>Week of {week.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</h2>
            <span className="small muted">{asg.data?.total ?? 0} assignments</span></div>
          {techs.error || asg.error ? <ErrorState error={techs.error || asg.error} onRetry={reload} /> : !techs.data || !asg.data ? <Loading /> : (
            <div className="table-wrap">
              <div className="cal">
                <div className="head">Technician</div>
                {days.map((d) => <div key={d.toISOString()} className={`head ${d.toDateString() === today ? "today" : ""}`}>{d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</div>)}
                {techs.data.items.map((tech) => (
                  <Row key={tech.id} tech={tech} days={days} today={today} items={asg.data!.items.filter((a) => a.technicianId === tech.id)} />
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="card">
          <div className="card-head"><h2>Awaiting assignment</h2><span className="small muted">Approved or triaged work with no assignee</span></div>
          {!unassigned.data ? <Loading /> : unassigned.data.items.length === 0 ? <div className="state small">All approved work is assigned.</div> : (
            <div className="table-wrap"><table className="table"><thead><tr><th>Work order</th><th>Priority</th><th>Status</th><th>Asset</th><th>Due</th></tr></thead>
              <tbody>{unassigned.data.items.map((w) => (
                <tr key={w.id}><td><Link href={`/m/work-orders/${w.id}`}>{String(w._label)}</Link></td><td><Badge value={w.priority} /></td><td><Badge value={w.status} /></td><td>{String(w.assetIdLabel ?? "—")}</td><td>{w.dueAt ? new Date(String(w.dueAt)).toLocaleString() : "—"}</td></tr>
              ))}</tbody></table></div>
          )}
        </div>
      </div>
      {run && <ActionRunner spec={{ ...run, body: undefined }} onClose={() => setRun(null)} onDone={() => { setRun(null); toast("Assignment created"); reload(); }} />}
    </>
  );
}

function Row({ tech, days, items, today }: { tech: Record<string, unknown>; days: Date[]; items: Record<string, unknown>[]; today: string }) {
  return (
    <>
      <div className="who">
        <Link href={`/m/technicians/${tech.id}`}>{String(tech.fullName)}</Link>
        <div className="small muted">{humanize(String(tech.trade))}</div>
        <Badge value={tech.availability} />
      </div>
      {days.map((d) => {
        const list = items.filter((a) => new Date(String(a.scheduledStart)).toDateString() === d.toDateString());
        return (
          <div key={d.toISOString()} className={`slot ${d.toDateString() === today ? "today" : ""}`}>
            {list.map((a) => (
              <Link key={String(a.id)} href={`/m/work-orders/${a.workOrderId}`} className="ev" title={String(a.workOrderIdLabel)}>
                <strong>{new Date(String(a.scheduledStart)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong> {String(a.workOrderIdLabel).replace(/^WO-\d+ · /, "")}
                <div className="small muted">{humanize(String(a.status))}</div>
              </Link>
            ))}
          </div>
        );
      })}
    </>
  );
}
