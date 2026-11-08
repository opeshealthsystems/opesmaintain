"use client";
import { num } from "@/lib/format";

/** Grouped column chart (SVG, no dependencies). Colors use semantic tokens. */
export function ColumnChart({ data, series, height = 220 }: {
  data: { label: string; values: number[] }[]; series: { name: string; color: string }[]; height?: number;
}) {
  const w = 640, padL = 36, padB = 28, padT = 10;
  const max = Math.max(1, ...data.flatMap((d) => d.values));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const gw = (w - padL) / Math.max(1, data.length);
  const bw = Math.min(22, (gw - 12) / series.length);
  const y = (v: number) => padT + (height - padT - padB) * (1 - v / top);
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${w} ${height}`} className="chart" role="img" aria-label={`Chart: ${series.map((s) => s.name).join(" and ")}`}>
        {Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step).map((v) => (
          <g key={v}><line className="grid-line" x1={padL} x2={w} y1={y(v)} y2={y(v)} /><text x={padL - 6} y={y(v) + 4} textAnchor="end">{v}</text></g>
        ))}
        {data.map((d, i) => (
          <g key={d.label}>
            {d.values.map((v, j) => (
              <rect key={j} x={padL + i * gw + (gw - bw * series.length) / 2 + j * bw} y={y(v)} width={bw - 2} height={Math.max(0, y(0) - y(v))} rx={2} fill={series[j].color}>
                <title>{`${series[j].name}: ${v}`}</title>
              </rect>
            ))}
            <text x={padL + i * gw + gw / 2} y={height - 8} textAnchor="middle">{d.label}</text>
          </g>
        ))}
      </svg>
      <figcaption className="legend">{series.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</figcaption>
    </figure>
  );
}

export function BarList({ items, unit, format }: { items: { name: string; value: number }[]; unit?: string; format?: (v: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <div className="small muted">No data for this period.</div>;
  return (
    <div>
      {items.map((i) => (
        <div className="bar-row" key={i.name}>
          <span className="name" title={i.name}>{i.name}</span>
          <span className="track"><span className="fill" style={{ display: "block", width: `${(i.value / max) * 100}%` }} /></span>
          <span className="num small">{format ? format(i.value) : `${num(i.value, 1)}${unit ? ` ${unit}` : ""}`}</span>
        </div>
      ))}
    </div>
  );
}

/** Thin progress ring for a percentage KPI. */
export function Ring({ value, label }: { value: number | null; label: string }) {
  const r = 30, c = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <svg viewBox="0 0 80 80" width="80" height="80" role="img" aria-label={`${label}: ${value === null ? "no data" : `${v}%`}`}>
      <circle cx="40" cy="40" r={r} fill="none" stroke="var(--neutral-soft)" strokeWidth="7" />
      <circle cx="40" cy="40" r={r} fill="none" stroke="var(--accent)" strokeWidth="7" strokeDasharray={`${(v / 100) * c} ${c}`} strokeLinecap="round" transform="rotate(-90 40 40)" />
      <text x="40" y="45" textAnchor="middle" style={{ fontSize: 15, fontWeight: 600, fill: "var(--text)" }}>{value === null ? "—" : `${Math.round(v)}%`}</text>
    </svg>
  );
}

function niceStep(max: number) {
  const raw = max / 4;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
