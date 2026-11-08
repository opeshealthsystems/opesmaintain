"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PartStockActions, StockTable } from "@/components/panels";
import { RecordTable } from "@/components/ResourceList";
import { Badge, ErrorState, Loading, PageHeader, Stat, useData } from "@/components/ui";
import { api, type Page } from "@/lib/api";
import { money, num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { Icon } from "@/lib/icons";
import { resource } from "@/lib/registry";

export default function StockControl() {
  const t = useT();
  const router = useRouter();
  const [wh, setWh] = useState("");
  const [part, setPart] = useState("");
  const parts = useData(() => api<Page>("/parts?size=500&sort=partNo,asc"), []);
  const whs = useData(() => api<Page>("/warehouses?size=100&sort=name,asc"), []);
  const moves = useData(() => api<Page>("/stock-movements?size=12"), []);
  const res = useData(() => api<Page>("/stock-reservations?status=OPEN&size=20"), []);
  if (parts.error) return <ErrorState error={parts.error} onRetry={parts.reload} />;
  if (!parts.data || !whs.data) return <Loading />;
  const items = parts.data.items;
  const value = items.reduce((s, p) => s + Number(p.onHand ?? 0) * Number(p.unitCost ?? 0), 0);
  const low = items.filter((p) => p.reorderPoint !== null && Number(p.available) <= Number(p.reorderPoint));
  const out = items.filter((p) => Number(p.available) <= 0);
  const reload = () => { parts.reload(); moves.reload(); res.reload(); };
  return (
    <>
      <PageHeader icon="Package" title={t("Stock control")} subtitle="Balances are derived from the signed movement ledger; every change is idempotent and audited."
        actions={<><Link className="btn" href="/m/cycle-counts/new"><Icon name="ScanBarcode" size={16} />Cycle count</Link><Link className="btn" href="/m/purchase-requisitions/new"><Icon name="ClipboardPen" size={16} />Requisition</Link><Link className="btn btn-primary" href="/m/parts/new"><Icon name="Plus" size={16} />New part</Link></>} />
      <div className="stack">
        <div className="grid grid-4">
          <Stat icon="Package" label="Active parts" value={num(items.length, 0)} meta={`${whs.data.total} storage locations`} href="/m/parts" />
          <Stat icon="Wallet" label="Inventory value" value={money(value)} meta="On hand × unit cost" href="/reports/INVENTORY_VALUATION" />
          <Stat icon="TriangleAlert" label="At or below reorder point" value={num(low.length, 0)} tone={low.length ? "warn" : undefined} meta="Raise requisitions" />
          <Stat icon="Ban" label="Out of stock" value={num(out.length, 0)} tone={out.length ? "danger" : undefined} meta="Available ≤ 0" />
        </div>
        <div className="card">
          <div className="card-head"><h2>Stock movement</h2><span className="small muted">Select a part to receive, adjust, transfer or return stock</span></div>
          <div className="toolbar">
            <select className="select grow" value={part} onChange={(e) => setPart(e.target.value)} aria-label="Part"><option value="">Select part…</option>{items.map((p) => <option key={p.id} value={p.id}>{String(p.partNo)} · {String(p.name)}</option>)}</select>
          </div>
          {part ? <><PartStockActions partId={part} onDone={reload} /><StockTable key={part + (moves.data?.total ?? 0)} url={`/parts/${part}/stock`} showWarehouse /></> : <div className="state small">Choose a part to see its balances by warehouse.</div>}
        </div>
        <div className="grid grid-2">
          <div className="card">
            <div className="card-head"><h2>Warehouse stock</h2>
              <select className="select" style={{ width: 220 }} value={wh} onChange={(e) => setWh(e.target.value)} aria-label="Warehouse"><option value="">Select warehouse…</option>{whs.data.items.map((w) => <option key={w.id} value={w.id}>{String(w.name)}</option>)}</select></div>
            {wh ? <StockTable key={wh} url={`/warehouses/${wh}/stock`} showWarehouse={false} /> : <div className="state small">Choose a warehouse.</div>}
          </div>
          <div className="card">
            <div className="card-head"><h2>Reorder list</h2><Link className="small" href="/m/purchase-requisitions">Requisitions</Link></div>
            {low.length === 0 ? <div className="state small">No parts below reorder point.</div> : (
              <div className="table-wrap"><table className="table"><thead><tr><th>Part</th><th className="num">Available</th><th className="num">Reorder point</th><th className="num">Reorder qty</th><th /></tr></thead>
                <tbody>{low.map((p) => (
                  <tr key={p.id}><td><Link href={`/m/parts/${p.id}`}>{String(p.partNo)} · {String(p.name)}</Link>{p.criticalSpare ? <> <Badge value="CRITICAL" /></> : null}</td>
                    <td className="num">{num(p.available)}</td><td className="num">{num(p.reorderPoint)}</td><td className="num">{num(p.reorderQty)}</td>
                    <td><Link className="btn btn-sm" href={`/m/purchase-requisitions/new?partId=${p.id}`}>Requisition</Link></td></tr>
                ))}</tbody></table></div>
            )}
          </div>
        </div>
        <div className="grid grid-2">
          <div className="card">
            <div className="card-head"><h2>Open reservations</h2><Link className="small" href="/m/stock-reservations">All</Link></div>
            {res.data && res.data.items.length ? <RecordTable def={resource("stock-reservations")!} rows={res.data.items} onOpen={(id) => router.push(`/m/stock-reservations/${id}`)} /> : <div className="state small">No open reservations.</div>}
          </div>
          <div className="card">
            <div className="card-head"><h2>Latest movements</h2><Link className="small" href="/m/stock-movements">Ledger</Link></div>
            {moves.data ? <RecordTable def={resource("stock-movements")!} rows={moves.data.items} columns={["movementType", "partId", "warehouseId", "quantity", "occurredAt"]} onOpen={(id) => router.push(`/m/stock-movements/${id}`)} /> : <Loading />}
          </div>
        </div>
      </div>
    </>
  );
}
