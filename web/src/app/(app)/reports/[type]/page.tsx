"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ErrorState, Loading, useData } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime, money, num } from "@/lib/format";
import { Icon } from "@/lib/icons";

const MONEY_COLS = /cost|value|total|amount/i;

export default function ReportView() {
  const { type } = useParams<{ type: string }>();
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(today);
  const { data, error, loading, reload } = useData(() => api<{ title: string; columns: string[]; rows: unknown[][]; generatedAt: string; generatedBy: string; from: string; to: string }>(`/reports/${type}?from=${from}&to=${to}`), [type, from, to]);
  const csv = () => {
    if (!data) return;
    const esc = (v: unknown) => { let s = v === null || v === undefined ? "" : String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
    const text = [data.columns.map(esc).join(","), ...data.rows.map((r) => r.map(esc).join(","))].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    a.download = `${type.toLowerCase()}-${to}.csv`;
    a.click();
  };
  return (
    <>
      <div className="row between no-print" style={{ marginBottom: 16 }}>
        <Link href="/reports" className="btn btn-ghost"><Icon name="ChevronLeft" size={16} />Reports</Link>
        <div className="row">
          <label className="small muted" htmlFor="from">From</label><input id="from" className="input" style={{ width: 160 }} type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          <label className="small muted" htmlFor="to">To</label><input id="to" className="input" style={{ width: 160 }} type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          <button className="btn" onClick={csv} disabled={!data}><Icon name="Download" size={16} />CSV</button>
          <button className="btn btn-primary" onClick={() => window.print()} disabled={!data}><Icon name="Printer" size={16} />Print / PDF</button>
        </div>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading || !data ? <Loading /> : (
        <article className="doc" style={{ maxWidth: 1200 }}>
          <div className="doc-head">
            <div><h1>{data.title}</h1><div className="small">Period {data.from} to {data.to}</div></div>
            <div className="small" style={{ textAlign: "right" }}><strong>{user?.tenantName}</strong><br />Generated {dateTime(data.generatedAt)}<br />by {data.generatedBy}</div>
          </div>
          {data.rows.length === 0 ? <p>No records in this period.</p> : (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead><tr>{data.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>{data.rows.map((r, i) => (
                  <tr key={i}>{r.map((v, j) => <td key={j} style={typeof v === "number" ? { textAlign: "right" } : undefined}>{typeof v === "number" ? (MONEY_COLS.test(data.columns[j]) ? money(v) : num(v)) : String(v ?? "")}</td>)}</tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <div className="small">{data.rows.length} row(s). Confidential — for authorized internal use.</div>
        </article>
      )}
    </>
  );
}
