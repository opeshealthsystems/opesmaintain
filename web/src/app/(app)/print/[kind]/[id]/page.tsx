"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ErrorState, Loading, useData } from "@/components/ui";
import { api, type Page } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, dateTime, humanize, money, num } from "@/lib/format";
import { Icon } from "@/lib/icons";

type R = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
const KIND: Record<string, { path: string; title: string }> = {
  "work-order": { path: "work-orders", title: "Work order report" },
  asset: { path: "assets", title: "Equipment passport & maintenance history" },
  quote: { path: "quotes", title: "Quotation" },
  permit: { path: "work-permits", title: "Permit to work" },
  "purchase-order": { path: "purchase-orders", title: "Purchase order" },
  calibration: { path: "calibration-events", title: "Calibration certificate" },
  inspection: { path: "inspection-results", title: "Inspection record" },
  billing: { path: "billing-exports", title: "Billing statement" },
};

async function loadBundle(kind: string, id: string): Promise<{ main: R; extra: Record<string, R[] | R | null> }> {
  const k = KIND[kind];
  const main = await api<R>(`/${k.path}/${id}`);
  const list = (u: string) => api<Page>(u).then((p) => p.items as R[]).catch(() => [] as R[]);
  const one = (u: string) => api<R>(u).catch(() => null);
  const extra: Record<string, R[] | R | null> = {};
  if (kind === "work-order") {
    [extra.tasks, extra.time, extra.parts, extra.signoffs, extra.costs] = await Promise.all([
      list(`/work-tasks?workOrderId=${id}&size=100&sort=sequence,asc`), list(`/time-entries?workOrderId=${id}&size=100`),
      list(`/stock-movements?workOrderId=${id}&size=100`), list(`/service-signoffs?workOrderId=${id}&size=10`), one(`/work-orders/${id}/costs`),
    ]);
  }
  if (kind === "asset") {
    [extra.wos, extra.events, extra.token] = await Promise.all([
      list(`/work-orders?assetId=${id}&size=100&sort=createdAt,desc`), list(`/asset-events?assetId=${id}&size=100`),
      api<Page>(`/passport-tokens?assetId=${id}&status=ACTIVE&size=1`).then((p) => (p.items[0] as R) ?? null).catch(() => null),
    ]);
  }
  if (kind === "permit" && main.workOrderId) extra.wo = await one(`/work-orders/${main.workOrderId}`);
  if (kind === "purchase-order" && main.vendorId) extra.vendor = await one(`/vendors/${main.vendorId}`);
  if (kind === "quote" && main.customerId) extra.customer = await one(`/customers/${main.customerId}`);
  if (kind === "billing") {
    extra.customer = await one(`/customers/${main.customerId}`);
    extra.wos = await list(`/work-orders?customerId=${main.customerId}&status=CLOSED&actualEndFrom=${main.periodStart}T00:00:00Z&actualEndTo=${main.periodEnd}T23:59:59Z&size=200`);
  }
  if (kind === "inspection") extra.template = await one(`/inspection-templates/${main.templateId}`);
  return { main, extra };
}

export default function PrintPage() {
  const { kind, id } = useParams<{ kind: string; id: string }>();
  const { user } = useAuth();
  const k = KIND[kind];
  const { data, error, loading } = useData(() => (k ? loadBundle(kind, id) : Promise.reject({ status: 404, message: "Unknown document" })), [kind, id]);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorState error={error} />;
  const { main: m, extra } = data;
  const Kv = ({ items }: { items: [string, unknown][] }) => <div className="kv">{items.map(([a, b]) => <div key={a}><span>{a}</span><span>{s(b)}</span></div>)}</div>;
  const list = (k2: string) => (extra[k2] as R[]) ?? [];

  return (
    <>
      <div className="row between no-print" style={{ marginBottom: 16 }}>
        <Link className="btn btn-ghost" href={`/m/${k.path}/${id}`}><Icon name="ChevronLeft" size={16} />Back to record</Link>
        <button className="btn btn-primary" onClick={() => window.print()}><Icon name="Printer" size={16} />Print / save as PDF</button>
      </div>
      <article className="doc">
        <header className="doc-head">
          <div><div className="small" style={{ fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" }}>{user?.tenantName}</div><h1>{k.title}</h1><div className="small">{s(m._label)}</div></div>
          <div className="small" style={{ textAlign: "right" }}>Reference <strong>{s(m.number ?? m.tag ?? String(m.id).slice(0, 8))}</strong><br />Status {humanize(s(m.status))}<br />Printed {dateTime(new Date().toISOString())}</div>
        </header>

        {kind === "work-order" && <>
          <Kv items={[["Work type", humanize(s(m.workType))], ["Priority", humanize(s(m.priority))], ["Asset", m.assetSnapshot ?? m.assetIdLabel], ["Site", m.siteIdLabel], ["Assigned to", m.assigneeIdLabel],
            ["Due", dateTime(m.dueAt)], ["Started", dateTime(m.actualStart)], ["Completed", dateTime(m.actualEnd)], ["Completed by", m.completedBy], ["Reviewed by", m.reviewedBy], ["Closeout code", m.closeoutCode], ["SLA due", dateTime(m.slaDueAt)]]} />
          <div className="section">Description</div><p style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{s(m.description)}</p>
          <div className="section">Tasks</div>
          <table><thead><tr><th>#</th><th>Task</th><th>Result</th><th>Status</th><th>By</th></tr></thead><tbody>
            {list("tasks").map((t) => <tr key={String(t.id)}><td>{s(t.sequence)}</td><td>{s(t.description)}</td><td>{s(t.result)}</td><td>{humanize(s(t.status))}</td><td>{s(t.completedBy)}</td></tr>)}
          </tbody></table>
          <div className="section">Labor</div>
          <table><thead><tr><th>Technician</th><th>Start</th><th>End</th><th>Hours</th><th>Cost</th></tr></thead><tbody>
            {list("time").map((t) => <tr key={String(t.id)}><td>{s(t.technicianIdLabel)}</td><td>{dateTime(t.startedAt)}</td><td>{dateTime(t.endedAt)}</td><td>{num(t.hours)}</td><td>{money(t.cost)}</td></tr>)}
          </tbody></table>
          <div className="section">Parts</div>
          <table><thead><tr><th>Part</th><th>Movement</th><th>Qty</th><th>Unit cost</th></tr></thead><tbody>
            {list("parts").map((p) => <tr key={String(p.id)}><td>{s(p.partIdLabel)}</td><td>{humanize(s(p.movementType))}</td><td>{num(Math.abs(Number(p.quantity)))}</td><td>{money(p.unitCost)}</td></tr>)}
          </tbody></table>
          <Kv items={[["Labor cost", money((extra.costs as R)?.laborCost)], ["Parts cost", money((extra.costs as R)?.partsCost)], ["Total cost", money((extra.costs as R)?.totalCost)], ["Failure / cause / remedy", `${s(m.failureCode)} / ${s(m.causeCode)} / ${s(m.remedyCode)}`]]} />
          <div className="section">Completion notes</div><p style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{s(m.completionNotes)}</p>
          {list("signoffs").length > 0 && <><div className="section">Customer sign-off</div>
            {list("signoffs").map((x) => <p key={String(x.id)} style={{ fontSize: 13 }}>{s(x.signedBy)} — {dateTime(x.signedAt)} — {x.accepted ? "Accepted" : "Not accepted"}{x.rating ? ` — rating ${x.rating}/5` : ""}</p>)}</>}
          <p className="small" style={{ marginTop: 10 }}>Work completion is a technician submission and does not by itself authorize the equipment to return to operation.</p>
          <div className="sign"><div>Technician</div><div>Supervisor / reviewer</div><div>Customer / asset owner</div></div>
        </>}

        {kind === "asset" && <AssetDoc m={m} wos={list("wos")} events={list("events")} token={extra.token as R | null} />}

        {kind === "quote" && <>
          <Kv items={[["Customer", m.customerIdLabel], ["Contact", (extra.customer as R)?.contactName], ["Email", (extra.customer as R)?.email], ["Valid until", date(m.validUntil)], ["Related work order", m.workOrderIdLabel], ["Currency", m.currency]]} />
          <div className="section">Scope</div><p style={{ fontSize: 13 }}>{s(m.title)}</p>
          <table><thead><tr><th>Item</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead><tbody>
            <tr><td>Labor</td><td style={{ textAlign: "right" }}>{money(m.laborAmount)}</td></tr><tr><td>Parts and materials</td><td style={{ textAlign: "right" }}>{money(m.partsAmount)}</td></tr>
            <tr><td>Tax ({num(m.taxRate)}%)</td><td style={{ textAlign: "right" }}>{money(Number(m.total) - Number(m.laborAmount ?? 0) - Number(m.partsAmount ?? 0))}</td></tr>
            <tr><th>Total</th><th style={{ textAlign: "right" }}>{money(m.total)}</th></tr></tbody></table>
          <div className="section">Notes</div><p style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{s(m.notes)}</p>
          {m.approvedBy ? <p className="small">Decision recorded by {s(m.approvedBy)} on {dateTime(m.approvedAt)}.</p> : null}
          <div className="sign"><div>Prepared by</div><div>Customer approval</div><div>Date</div></div>
        </>}

        {kind === "permit" && <>
          <Kv items={[["Permit type", humanize(s(m.permitType))], ["Site", m.siteIdLabel], ["Asset", m.assetIdLabel], ["Work order", (extra.wo as R)?._label], ["Valid from", dateTime(m.validFrom)], ["Valid to", dateTime(m.validTo)],
            ["Requested by", m.requestedBy], ["Issued by", m.issuedBy], ["Accepted by", m.acceptedBy], ["Status", humanize(s(m.status))]]} />
          <div className="section">Scope of work</div><p style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{s(m.scope)}</p>
          <div className="section">Hazards</div><p style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{s(m.hazards)}</p>
          <div className="section">Controls & PPE</div><p style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{s(m.controls)}</p>
          <div className="section">Isolation points</div><p style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{s(m.isolationPoints)}</p>
          <p className="small" style={{ marginTop: 10 }}>This permit does not replace physical lockout/tagout, isolation verification, site training or applicable law.</p>
          <div className="sign"><div>Issuer</div><div>Accepting worker</div><div>Permit closed by</div></div>
        </>}

        {kind === "purchase-order" && <>
          <Kv items={[["Vendor", m.vendorIdLabel], ["Vendor contact", (extra.vendor as R)?.contactName], ["Vendor email", (extra.vendor as R)?.email], ["Order date", date(m.orderDate)], ["Expected", date(m.expectedDate)], ["Deliver to", m.warehouseIdLabel]]} />
          <table><thead><tr><th>Part</th><th>Qty</th><th style={{ textAlign: "right" }}>Unit price</th><th style={{ textAlign: "right" }}>Total</th></tr></thead><tbody>
            <tr><td>{s(m.partIdLabel)}</td><td>{num(m.quantity)}</td><td style={{ textAlign: "right" }}>{money(m.unitPrice)}</td><td style={{ textAlign: "right" }}>{money(m.total)}</td></tr></tbody></table>
          <Kv items={[["Received to date", num(m.receivedQty)], ["Requisition", m.requisitionIdLabel]]} />
          <div className="sign"><div>Procurement</div><div>Approved by</div><div>Vendor acknowledgment</div></div>
        </>}

        {kind === "calibration" && <>
          <Kv items={[["Instrument", m.assetIdLabel], ["Plan", m.planIdLabel], ["Scheduled", date(m.scheduledOn)], ["Performed", date(m.performedOn)], ["Performed by", m.performedBy], ["Reference standard", m.referenceStandard],
            ["As-found in tolerance", m.asFoundInTolerance === null ? "—" : m.asFoundInTolerance ? "Yes" : "No"], ["As-left in tolerance", m.asLeftInTolerance === null ? "—" : m.asLeftInTolerance ? "Yes" : "No"],
            ["Certificate no.", m.certificateNo], ["Eligibility", humanize(s(m.eligibility))], ["Investigation required", m.investigationRequired ? "Yes" : "No"], ["Approved by", m.approvedBy]]} />
          <div className="section">As-found</div><p style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{s(m.asFound)}</p>
          <div className="section">As-left</div><p style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{s(m.asLeft)}</p>
          <div className="sign"><div>Calibrated by</div><div>Reviewed by</div><div>Approved by</div></div>
        </>}

        {kind === "inspection" && <>
          <Kv items={[["Template", m.templateIdLabel], ["Asset", m.assetIdLabel], ["Inspector", m.inspector], ["Performed", dateTime(m.performedAt)], ["Outcome", humanize(s(m.outcome))], ["Score", m.score === null ? "—" : `${m.score}%`], ["Follow-up work order", m.followUpWorkOrderIdLabel]]} />
          <div className="section">Checklist results</div>
          <table><thead><tr><th>Item</th></tr></thead><tbody>{s(m.answers).split("\n").map((l, i) => <tr key={i}><td>{l}</td></tr>)}</tbody></table>
          <div className="section">Defects found</div><p style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{s(m.defectsFound)}</p>
          <div className="sign"><div>Inspector</div><div>Supervisor</div><div>Date</div></div>
        </>}

        {kind === "billing" && <>
          <Kv items={[["Customer", m.customerIdLabel], ["Contract", m.contractIdLabel], ["Period", `${date(m.periodStart)} – ${date(m.periodEnd)}`], ["Target system", humanize(s(m.targetSystem))], ["External reference", m.externalRef], ["Status", humanize(s(m.status))]]} />
          <table><thead><tr><th>Work order</th><th>Completed</th><th style={{ textAlign: "right" }}>Labor</th><th style={{ textAlign: "right" }}>Parts</th></tr></thead><tbody>
            {list("wos").map((w) => <tr key={String(w.id)}><td>{s(w._label)}</td><td>{date(w.actualEnd)}</td><td style={{ textAlign: "right" }}>{money(w.laborCost)}</td><td style={{ textAlign: "right" }}>{money(w.partsCost)}</td></tr>)}
            <tr><th colSpan={3}>Batch amount (incl. contract fee)</th><th style={{ textAlign: "right" }}>{money(m.amount)}</th></tr></tbody></table>
        </>}
      </article>
    </>
  );
}

function AssetDoc({ m, wos, events, token }: { m: R; wos: R[]; events: R[]; token: R | null }) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    if (token) QRCode.toDataURL(`${window.location.origin}/passport/${token.token}`, { margin: 1, width: 240 }).then(setQr).catch(() => setQr(""));
  }, [token]);
  return (
    <>
      <div className="row" style={{ alignItems: "flex-start", gap: 24 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="kv">{([["Tag", m.tag], ["Type", humanize(s(m.assetType))], ["Manufacturer", m.manufacturer], ["Model", m.model], ["Serial", m.serialNumber], ["Criticality", humanize(s(m.criticality))],
            ["Site", m.siteIdLabel], ["Location", m.locationIdLabel], ["Commissioned", date(m.commissionedOn)], ["Warranty end", date(m.warrantyEnd)], ["Status", humanize(s(m.status))], ["Safety", humanize(s(m.safetyState))]] as [string, unknown][]).map(([a, b]) => <div key={a}><span>{a}</span><span>{s(b)}</span></div>)}</div>
        </div>
        {qr && <div style={{ textAlign: "center" }}><img src={qr} width={120} height={120} alt="Equipment passport QR code" /><div className="small">Scan for passport</div></div>}
      </div>
      <div className="section">Maintenance history</div>
      <table><thead><tr><th>Work order</th><th>Type</th><th>Status</th><th>Created</th><th>Completed</th></tr></thead><tbody>
        {wos.map((w) => <tr key={String(w.id)}><td>{s(w._label)}</td><td>{humanize(s(w.workType))}</td><td>{humanize(s(w.status))}</td><td>{date(w.createdAt)}</td><td>{date(w.actualEnd)}</td></tr>)}
      </tbody></table>
      <div className="section">Lifecycle events</div>
      <table><thead><tr><th>Event</th><th>From</th><th>To</th><th>Reason</th><th>When</th><th>By</th></tr></thead><tbody>
        {events.map((e) => <tr key={String(e.id)}><td>{humanize(s(e.eventType))}</td><td>{s(e.fromValue)}</td><td>{s(e.toValue)}</td><td>{s(e.reason)}</td><td>{dateTime(e.effectiveAt)}</td><td>{s(e.actor)}</td></tr>)}
      </tbody></table>
    </>
  );
}
