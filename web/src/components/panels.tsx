"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api, download, type Page, type Row } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, dateTime, humanize, money, num } from "@/lib/format";
import { Icon } from "@/lib/icons";
import { ActionRunner, type RunSpec } from "./ActionRunner";
import { Alert, Badge, Empty, ErrorState, Loading, useData, useToast } from "./ui";

type R = Record<string, unknown>;

/** Work-order execution: checklist recording, parts, labor and live job costing. */
export function WorkOrderExecution({ wo, onChanged }: { wo: R; onChanged: () => void }) {
  const toast = useToast();
  const { hasRole } = useAuth();
  const [run, setRun] = useState<RunSpec | null>(null);
  const id = String(wo.id);
  const tasks = useData(() => api<Page>(`/work-tasks?workOrderId=${id}&size=100&sort=sequence,asc`), [id, wo.version]);
  const res = useData(() => api<Page>(`/stock-reservations?workOrderId=${id}&size=100`), [id, wo.version]);
  const time = useData(() => api<Page>(`/time-entries?workOrderId=${id}&size=100`), [id, wo.version]);
  const costs = useData(() => api<R>(`/work-orders/${id}/costs`), [id, wo.version]);
  const inProgress = wo.status === "IN_PROGRESS";
  const locked = ["CLOSED", "CANCELLED"].includes(String(wo.status));
  const reload = () => { tasks.reload(); res.reload(); time.reload(); costs.reload(); onChanged(); };

  const record = async (taskId: string, status: string) => {
    try {
      await api(`/work-orders/${id}/tasks/${taskId}:record`, { body: { status } });
      toast(`Task marked ${status.toLowerCase()}`);
      tasks.reload();
    } catch (e) { toast((e as Error).message, "err"); }
  };

  return (
    <div className="stack" style={{ padding: 16 }}>
      {!inProgress && !locked && <Alert tone="info">Task results can be recorded once the work order is <strong>In progress</strong>.</Alert>}
      <div className="grid grid-4">
        <div className="card stat"><div className="label">Labor hours</div><div className="value">{num(costs.data?.laborHours)}</div><div className="meta">Estimate {num(wo.estimatedHours)} h</div></div>
        <div className="card stat"><div className="label">Labor cost</div><div className="value">{money(costs.data?.laborCost)}</div></div>
        <div className="card stat"><div className="label">Parts cost</div><div className="value">{money(costs.data?.partsCost)}</div></div>
        <div className="card stat"><div className="label">Total job cost</div><div className="value">{money(costs.data?.totalCost)}</div></div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Task checklist</h3>
          {!locked && <Link className="btn btn-sm" href={`/m/work-tasks/new?workOrderId=${id}`}><Icon name="Plus" size={14} />Add task</Link>}
        </div>
        {tasks.loading && !tasks.data ? <Loading /> : tasks.error ? <ErrorState error={tasks.error} /> : tasks.data!.items.length === 0 ? <Empty title="No tasks yet" hint="Add tasks before planning this work order." icon="ListChecks" /> : (
          <div>
            {tasks.data!.items.map((t) => (
              <div className="check-item" key={t.id}>
                <Icon name={t.status === "DONE" ? "CircleCheck" : t.status === "FAILED" ? "CircleX" : "Circle"} size={20} style={{ color: t.status === "DONE" ? "var(--ok)" : t.status === "FAILED" ? "var(--danger)" : "var(--text-3)", flex: "0 0 auto", marginTop: 1 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{String(t.sequence)}. {String(t.description)} {t.required ? <span className="small muted">· required</span> : null}</div>
                  {t.result ? <div className="small muted">{String(t.result)}</div> : null}
                  {t.completedBy ? <div className="small muted">{String(t.completedBy)} · {dateTime(t.completedAt)}</div> : null}
                </div>
                {inProgress && (
                  <div className="row" style={{ flex: "0 0 auto" }}>
                    <button className="btn btn-sm" onClick={() => record(t.id, "DONE")}><Icon name="Check" size={14} />Done</button>
                    <button className="btn btn-sm btn-danger" onClick={() => record(t.id, "FAILED")}>Failed</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-head"><h3>Parts</h3>
            {!locked && hasRole("STOREKEEPER", "MANAGER", "TECHNICIAN", "PLANNER") && (
              <button className="btn btn-sm" onClick={() => setRun({ title: "Reserve parts", endpoint: "/stock-reservations", body: { workOrderId: id, clientOperationId: crypto.randomUUID() },
                fields: [{ name: "partId", label: "Part", type: "ref", ref: "parts", required: true }, { name: "warehouseId", label: "Warehouse", type: "ref", ref: "warehouses", required: true }, { name: "quantity", label: "Quantity", type: "number", required: true }] })}>
                <Icon name="PackagePlus" size={14} />Reserve
              </button>
            )}
          </div>
          {res.data && res.data.items.length === 0 ? <Empty title="No parts reserved" icon="Package" /> : (
            <div className="table-wrap"><table className="table"><thead><tr><th>Part</th><th className="num">Qty</th><th className="num">Issued</th><th>Status</th><th /></tr></thead>
              <tbody>{(res.data?.items ?? []).map((r) => (
                <tr key={r.id}><td>{String(r.partIdLabel)}</td><td className="num">{num(r.quantity)}</td><td className="num">{num(r.issuedQty)}</td><td><Badge value={r.status} /></td>
                  <td>{r.status === "OPEN" && (
                    <div className="row" style={{ flexWrap: "nowrap" }}>
                      <button className="btn btn-sm" onClick={() => setRun({ title: "Issue parts", endpoint: `/stock-reservations/${r.id}:issue`, body: { clientOperationId: crypto.randomUUID() } })}>Issue</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => setRun({ title: "Release reservation", endpoint: `/stock-reservations/${r.id}:release` })}>Release</button>
                    </div>
                  )}</td></tr>
              ))}</tbody></table></div>
          )}
        </div>
        <div className="card">
          <div className="card-head"><h3>Labor</h3>
            {!locked && <Link className="btn btn-sm" href={`/m/time-entries/new?workOrderId=${id}${wo.assigneeId ? `&technicianId=${wo.assigneeId}` : ""}`}><Icon name="Timer" size={14} />Log time</Link>}
          </div>
          {time.data && time.data.items.length === 0 ? <Empty title="No time logged" icon="Timer" /> : (
            <div className="table-wrap"><table className="table"><thead><tr><th>Technician</th><th>Start</th><th className="num">Hours</th><th className="num">Cost</th><th>Approved</th><th /></tr></thead>
              <tbody>{(time.data?.items ?? []).map((t) => (
                <tr key={t.id}><td><Link href={`/m/time-entries/${t.id}`}>{String(t.technicianIdLabel)}</Link></td><td>{dateTime(t.startedAt)}</td><td className="num">{num(t.hours)}</td><td className="num">{money(t.cost)}</td><td><Badge value={t.approved ? "YES" : "PENDING"} /></td>
                  <td>{!t.approved && hasRole("MANAGER", "PLANNER", "DISPATCHER") && <button className="btn btn-sm" onClick={async () => { try { await api(`/time-entries/${t.id}:approve`, { method: "POST" }); toast("Time approved"); reload(); } catch (e) { toast((e as Error).message, "err"); } }}>Approve</button>}</td></tr>
              ))}</tbody></table></div>
          )}
        </div>
      </div>
      {run && <ActionRunner spec={run} onClose={() => setRun(null)} onDone={() => { setRun(null); toast("Done"); reload(); }} />}
    </div>
  );
}

export function AssetTree({ id }: { id: string }) {
  const { data, error, loading } = useData(() => api<{ id: string; tag: string; name: string; status: string; depth: number }[]>(`/assets/${id}/tree`), [id]);
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  return (
    <div style={{ padding: 8 }}>
      {data!.map((n) => (
        <div key={n.id} className="row" style={{ padding: "8px 12px", paddingLeft: 12 + n.depth * 24, borderBottom: "1px solid var(--border)" }}>
          <Icon name={n.depth === 0 ? "Boxes" : "CornerDownRight"} size={16} />
          <Link href={`/m/assets/${n.id}`}>{n.tag} · {n.name}</Link>
          <Badge value={n.status} />
        </div>
      ))}
      {data!.length === 1 && <div className="small muted" style={{ padding: 12 }}>This asset has no child components.</div>}
    </div>
  );
}

export function PassportPanel({ id }: { id: string }) {
  const { data } = useData(() => api<Page>(`/passport-tokens?assetId=${id}&status=ACTIVE&size=5`), [id]);
  const token = data?.items[0];
  if (!data) return <Loading />;
  if (!token) return <Empty title="No active QR passport" hint="Use “Issue QR passport” to create a scannable label." icon="QrCode" />;
  return <PassportCard id={id} token={token} />;
}

function PassportCard({ id, token }: { id: string; token: Row }) {
  const url = typeof window !== "undefined" ? `${window.location.origin}/passport/${token.token}` : "";
  const [qr, setQr] = useState<string>("");
  useEffect(() => { QRCode.toDataURL(url, { margin: 1, width: 320 }).then(setQr).catch(() => setQr("")); }, [url]);
  return (
    <div className="card-body stack">
      <Alert tone="info">The QR code contains only a random reference token. Scanning it requires sign-in and is audited.</Alert>
      <div className="row" style={{ alignItems: "flex-start", gap: 24 }}>
        <img alt="QR code for equipment passport" width={168} height={168} style={{ border: "1px solid var(--border)", borderRadius: 8, background: "#fff", padding: 6 }}
          src={qr || undefined} />
        <div className="stack" style={{ gap: 6, minWidth: 0 }}>
          <div><span className="muted small">Passport URL</span><div className="mono" style={{ overflowWrap: "anywhere" }}>{url}</div></div>
          <div><span className="muted small">Issued</span><div>{dateTime(token.issuedAt)}</div></div>
          <div><span className="muted small">Scans</span><div>{num(token.scanCount, 0)}</div></div>
          <div className="row"><Link className="btn btn-sm" href={`/passport/${token.token}`}><Icon name="ExternalLink" size={14} />Open passport</Link>
            <Link className="btn btn-sm" href={`/print/asset/${id}`}><Icon name="Printer" size={14} />Print label & history</Link></div>
        </div>
      </div>
    </div>
  );
}

export function PmForecast({ id }: { id: string }) {
  const { data, error, loading } = useData(() => api<{ dueAt: string; localDue: string }[]>(`/pm-plans/${id}/forecast?count=8`), [id]);
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  if (!data!.length) return <Empty title="No calendar forecast" hint="Meter-based plans trigger when the meter threshold is crossed." icon="Gauge" />;
  return (
    <div className="table-wrap"><table className="table"><thead><tr><th>#</th><th>Due (site local time)</th><th>Due (UTC)</th></tr></thead>
      <tbody>{data!.map((o, i) => <tr key={o.dueAt}><td>{i + 1}</td><td>{o.localDue}</td><td className="mono">{o.dueAt}</td></tr>)}</tbody></table></div>
  );
}

export function StockTable({ url, showWarehouse }: { url: string; showWarehouse: boolean }) {
  const { data, error, loading } = useData(() => api<R[]>(url), [url]);
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  if (!data!.length) return <Empty title="No stock on hand" icon="Package" />;
  return (
    <div className="table-wrap"><table className="table"><thead><tr>{showWarehouse ? <th>Warehouse</th> : <th>Part</th>}<th className="num">On hand</th><th className="num">Reserved</th><th className="num">Available</th><th className="num">Value</th></tr></thead>
      <tbody>{data!.map((r) => {
        const low = r.reorderPoint !== null && Number(r.available) <= Number(r.reorderPoint);
        return (
          <tr key={`${r.warehouseId}-${r.partId}`}>
            <td>{showWarehouse ? <Link href={`/m/warehouses/${r.warehouseId}`}>{String(r.warehouseName)}</Link> : <Link href={`/m/parts/${r.partId}`}>{String(r.partNo)} · {String(r.partName)}</Link>}</td>
            <td className="num">{num(r.onHand)} {String(r.unit)}</td><td className="num">{num(r.reserved)}</td>
            <td className="num">{low ? <Badge value={`${num(r.available)}`} tone="tone-warn" /> : num(r.available)}</td><td className="num">{money(r.value)}</td>
          </tr>
        );
      })}</tbody></table></div>
  );
}

export function PartStockActions({ partId, onDone }: { partId: string; onDone: () => void }) {
  const { hasRole } = useAuth();
  const toast = useToast();
  const [run, setRun] = useState<RunSpec | null>(null);
  const op = () => ({ clientOperationId: crypto.randomUUID(), partId });
  const wh = { name: "warehouseId", label: "Warehouse", type: "ref" as const, ref: "warehouses", required: true };
  if (!hasRole("STOREKEEPER", "MANAGER", "PROCUREMENT")) return null;
  return (
    <div className="row" style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
      <button className="btn btn-sm" onClick={() => setRun({ title: "Receive stock", endpoint: "/stock-receipts", body: op(), fields: [wh, { name: "quantity", label: "Quantity", type: "number", required: true }, { name: "unitCost", label: "Unit cost", type: "number" }, { name: "reference", label: "Reference (delivery note)", type: "text" }] })}><Icon name="PackagePlus" size={14} />Receive</button>
      <button className="btn btn-sm" onClick={() => setRun({ title: "Adjust stock", endpoint: "/stock-adjustments", body: op(), fields: [wh, { name: "quantity", label: "Adjustment (+/−)", type: "number", required: true }, { name: "reason", label: "Reason", type: "textarea", required: true }] })}><Icon name="SlidersHorizontal" size={14} />Adjust</button>
      <button className="btn btn-sm" onClick={() => setRun({ title: "Transfer stock", endpoint: "/stock-transfers", body: op(), fields: [{ ...wh, name: "fromWarehouseId", label: "From warehouse" }, { ...wh, name: "toWarehouseId", label: "To warehouse" }, { name: "quantity", label: "Quantity", type: "number", required: true }] })}><Icon name="ArrowLeftRight" size={14} />Transfer</button>
      <button className="btn btn-sm" onClick={() => setRun({ title: "Return to stock", endpoint: "/stock-returns", body: op(), fields: [wh, { name: "workOrderId", label: "From work order", type: "ref", ref: "work-orders" }, { name: "quantity", label: "Quantity", type: "number", required: true }, { name: "reason", label: "Reason", type: "text" }] })}><Icon name="Undo2" size={14} />Return</button>
      {run && <ActionRunner spec={run} onClose={() => setRun(null)} onDone={() => { setRun(null); toast("Stock updated"); onDone(); }} />}
    </div>
  );
}

export function DocumentFile({ doc, onChanged }: { doc: R; onChanged: () => void }) {
  const toast = useToast();
  const { canWrite } = useAuth();
  const [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    setBusy(true);
    try {
      const r = await api<R>(`/documents/${doc.id}/file`, { body: fd });
      toast(r.status === "ACCEPTED" ? "File uploaded and accepted" : "File quarantined: type not allowed", r.status === "ACCEPTED" ? "ok" : "err");
      onChanged();
    } catch (e) { toast((e as Error).message, "err"); } finally { setBusy(false); }
  };
  return (
    <div className="card-body stack">
      {doc.fileName ? (
        <div className="row between">
          <div className="row"><Icon name="Paperclip" /><div><div style={{ fontWeight: 600 }}>{String(doc.fileName)}</div>
            <div className="small muted">{String(doc.contentType)} · {num(Number(doc.sizeBytes) / 1024, 1)} KB · SHA-256 <span className="mono">{String(doc.checksumSha256).slice(0, 16)}…</span></div></div></div>
          {doc.status === "ACCEPTED" && <button className="btn" onClick={() => download(`/documents/${doc.id}/download`, String(doc.fileName))}><Icon name="Download" size={16} />Download</button>}
        </div>
      ) : <Empty title="No file attached" hint="Upload PDF, image, text, Word or Excel files up to 25 MB." icon="Paperclip" />}
      {canWrite("documents") && (
        <label className="btn" style={{ alignSelf: "flex-start" }}>
          <Icon name="Upload" size={16} />{busy ? "Uploading…" : doc.fileName ? "Replace file" : "Upload file"}
          <input type="file" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        </label>
      )}
    </div>
  );
}

export function AuditTrail({ entityId }: { entityId: string }) {
  const { data, error, loading } = useData(() => api<Page>(`/audit-events?entityId=${entityId}&size=100`), [entityId]);
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  if (!data!.items.length) return <Empty title="No history" icon="History" />;
  return (
    <div>
      {data!.items.map((e: Row) => (
        <div key={e.id} className="check-item">
          <Icon name="History" size={16} style={{ marginTop: 2, color: "var(--text-3)" }} />
          <div style={{ minWidth: 0 }}>
            <div><strong>{humanize(String(e.action))}</strong> <span className="muted">by {String(e.actor)} · {dateTime(e.occurredAt)}</span></div>
            <div className="small mono muted" style={{ overflowWrap: "anywhere", whiteSpace: "normal" }}>{String(e.detail)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export const fmtDate = date;

export function AssetReliability({ id }: { id: string }) {
  const { data, error, loading } = useData(() => api<Record<string, unknown>>(`/assets/${id}/reliability`), [id]);
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  const d = data!;
  return (
    <div className="card-body stack">
      <div className="grid grid-4">
        <div className="card stat"><div className="label">Unplanned failures</div><div className="value">{num(d.unplannedFailures, 0)}</div></div>
        <div className="card stat"><div className="label">MTBF</div><div className="value">{d.mtbfDays === null ? "—" : `${num(d.mtbfDays, 1)} d`}</div></div>
        <div className="card stat"><div className="label">Next expected failure</div><div className="value" style={{ fontSize: 18 }}>{d.predictedNextFailure ? date(d.predictedNextFailure) : "—"}</div>
          <div className="meta">{d.predictedNextFailure ? `${Math.round(Number(d.confidence) * 100)}% confidence` : "Needs at least 3 failures"}</div></div>
        <div className="card stat"><div className="label">Total downtime</div><div className="value">{num(d.totalDowntimeHours, 1)} h</div></div>
      </div>
      <Alert tone="info">{String(d.method)}. Forecasts are guidance for planning and do not trigger work automatically.</Alert>
    </div>
  );
}
