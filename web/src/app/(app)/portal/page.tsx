"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionRunner, type RunSpec } from "@/components/ActionRunner";
import { RecordTable } from "@/components/ResourceList";
import { Empty, ErrorState, Loading, PageHeader, Stat, useData, useToast } from "@/components/ui";
import { api, type Page } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { Icon } from "@/lib/icons";
import { resource } from "@/lib/registry";

export default function Portal() {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const [run, setRun] = useState<RunSpec | null>(null);
  const summary = useData(() => api<Record<string, number>>("/portal/summary"), []);
  const jobs = useData(() => api<Page>("/work-orders?size=10&sort=updatedAt,desc"), []);
  const signoff = useData(() => api<Page>("/work-orders?status=WORK_COMPLETED,REVIEWED&size=10"), []);
  const quotes = useData(() => api<Page>("/quotes?status=SENT&size=10"), []);
  const reqs = useData(() => api<Page>("/maintenance-requests?size=8"), []);
  if (summary.error) return <ErrorState error={summary.error} />;
  const s = summary.data;
  const reload = () => { summary.reload(); jobs.reload(); signoff.reload(); quotes.reload(); reqs.reload(); };
  return (
    <>
      <PageHeader icon="Globe" title={t("Customer portal")} subtitle={user?.role === "CUSTOMER" ? `Welcome, ${user.fullName}` : "Preview of the customer experience (internal view shows all customers)."}
        actions={<Link className="btn btn-primary" href="/m/maintenance-requests/new"><Icon name="TriangleAlert" size={16} />{t("Report a fault")}</Link>} />
      {!s ? <Loading /> : (
        <div className="stack">
          <div className="grid grid-3">
            <Stat icon="Boxes" label="Equipment" value={s.assets} href="/m/assets" meta={`${s.activeContracts} active contract(s)`} />
            <Stat icon="Inbox" label="Open requests" value={s.openRequests} href="/m/maintenance-requests" meta="Awaiting triage or conversion" />
            <Stat icon="ClipboardList" label="Active jobs" value={s.activeWork} href="/m/work-orders" meta={`${s.awaitingSignoff} awaiting your sign-off · ${s.pendingQuotes} quote(s) to review`} />
          </div>
          <div className="grid grid-2">
            <div className="card">
              <div className="card-head"><h2>Awaiting your sign-off</h2></div>
              {!signoff.data ? <Loading /> : signoff.data.items.length === 0 ? <Empty title="Nothing to sign" icon="Signature" /> : signoff.data.items.map((w) => (
                <div key={w.id} className="check-item">
                  <Icon name="ClipboardCheck" size={18} style={{ color: "var(--accent)" }} />
                  <div style={{ flex: 1, minWidth: 0 }}><Link href={`/m/work-orders/${w.id}`}>{String(w._label)}</Link><div className="small muted">{String(w.completionNotes ?? "Work completed")}</div></div>
                  <button className="btn btn-sm btn-primary" onClick={() => setRun({ title: `Sign off ${w.number}`, endpoint: "/service-signoffs", body: { workOrderId: w.id }, submitLabel: "Sign off",
                    fields: [{ name: "signedBy", label: "Your name", type: "text", required: true }, { name: "rating", label: "Rating (1–5)", type: "enum", options: ["5", "4", "3", "2", "1"] }, { name: "accepted", label: "I accept the completed work", type: "bool" }, { name: "comment", label: "Comment", type: "textarea" }] })}>Sign off</button>
                </div>
              ))}
            </div>
            <div className="card">
              <div className="card-head"><h2>Quotations to review</h2></div>
              {!quotes.data ? <Loading /> : quotes.data.items.length === 0 ? <Empty title="No pending quotations" icon="Receipt" /> : (
                <RecordTable def={resource("quotes")!} rows={quotes.data.items} columns={["number", "title", "total", "validUntil"]} onOpen={(id) => router.push(`/m/quotes/${id}`)} />
              )}
            </div>
          </div>
          <div className="grid grid-2">
            <div className="card"><div className="card-head"><h2>Recent jobs</h2><Link className="small" href="/m/work-orders">All</Link></div>
              {jobs.data && jobs.data.items.length ? <RecordTable def={resource("work-orders")!} rows={jobs.data.items} columns={["number", "title", "status", "dueAt"]} onOpen={(id) => router.push(`/m/work-orders/${id}`)} /> : <Empty title="No jobs" icon="ClipboardList" />}
            </div>
            <div className="card"><div className="card-head"><h2>Your requests</h2><Link className="small" href="/m/maintenance-requests">All</Link></div>
              {reqs.data && reqs.data.items.length ? <RecordTable def={resource("maintenance-requests")!} rows={reqs.data.items} columns={["number", "title", "priority", "status"]} onOpen={(id) => router.push(`/m/maintenance-requests/${id}`)} /> : <Empty title="No requests" icon="Inbox" />}
            </div>
          </div>
        </div>
      )}
      {run && <ActionRunner spec={run} onClose={() => setRun(null)} onDone={() => { setRun(null); toast("Thank you — sign-off recorded"); reload(); }} />}
    </>
  );
}
