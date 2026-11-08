"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, download, type Page } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { Icon } from "@/lib/icons";
import { modules, type ResourceDef } from "@/lib/registry";
import { formatValue, humanize } from "@/lib/format";
import { Badge, Empty, ErrorState, Loading, PageHeader } from "./ui";

const BADGE_FIELDS = new Set(["status", "priority", "criticality", "safetyState", "outcome", "severity", "availability", "eligibility"]);

export function cellFor(def: ResourceDef, name: string, row: Record<string, unknown>) {
  const f = def.fields.find((x) => x.name === name)!;
  if (f.type === "enum" && BADGE_FIELDS.has(f.name)) return <Badge value={row[f.name]} />;
  if (f.type === "bool") return row[f.name] === null || row[f.name] === undefined ? <span className="muted">—</span> : row[f.name] ? <Badge value="YES" plain /> : <Badge value="NO" plain tone="tone-neutral" />;
  const v = formatValue(f, row);
  const numeric = ["int", "dec", "money"].includes(f.type);
  return <span className={numeric ? "num" : undefined} title={v}>{v}</span>;
}

/** Embedded table used both by list pages and related tabs. */
export function RecordTable({ def, rows, onOpen, columns }: { def: ResourceDef; rows: Record<string, unknown>[]; onOpen?: (id: string) => void; columns?: string[] }) {
  const cols = columns ?? def.fields.filter((f) => f.list).map((f) => f.name);
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>{cols.map((c) => { const f = def.fields.find((x) => x.name === c)!; return <th key={c} className={["int", "dec", "money"].includes(f.type) ? "num" : undefined}>{f.label}</th>; })}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r.id)} className={onOpen ? "clickable" : undefined} onClick={() => onOpen?.(String(r.id))} tabIndex={onOpen ? 0 : undefined}
              onKeyDown={(e) => { if (e.key === "Enter") onOpen?.(String(r.id)); }}>
              {cols.map((c, i) => (
                <td key={c}>{i === 0 && onOpen ? <Link href={`/m/${def.path}/${r.id}`} onClick={(e) => e.stopPropagation()}>{cellFor(def, c, r)}</Link> : cellFor(def, c, r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ResourceList({ def }: { def: ResourceDef }) {
  const t = useT();
  const router = useRouter();
  const sp = useSearchParams();
  const { canWrite } = useAuth();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [debounced, setDebounced] = useState(q);
  const filterFields = useMemo(() => def.fields.filter((f) => f.type === "enum" && f.list).slice(0, 3), [def]);
  const [filters, setFilters] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const f of def.fields) { const v = sp.get(f.name); if (v) o[f.name] = v; }
    return o;
  });
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<string>("");
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const size = 25;

  useEffect(() => { const h = setTimeout(() => setDebounced(q), 300); return () => clearTimeout(h); }, [q]);
  useEffect(() => setPage(0), [debounced, filters]);

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), size: String(size) });
    if (debounced) p.set("q", debounced);
    if (sort) p.set("sort", sort);
    for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
    return p;
  }, [page, debounced, sort, filters]);

  const load = () => {
    setLoading(true);
    setError(null);
    api<Page>(`/${def.path}?${params}`).then(setData).catch(setError).finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [def.path, params]);

  const cols = def.fields.filter((f) => f.list);
  const mod = modules[def.module];
  const pages = data ? Math.max(1, Math.ceil(data.total / size)) : 1;
  const toggleSort = (name: string) => setSort((s) => (s === `${name},asc` ? `${name},desc` : `${name},asc`));
  const refFilters = Object.entries(filters).filter(([k]) => def.fields.find((f) => f.name === k)?.type === "ref");

  return (
    <>
      <PageHeader
        icon={def.icon}
        title={def.label}
        subtitle={<>{def.desc} <span className="muted">· {mod.code} {mod.title}</span></>}
        crumbs={[{ href: "/modules", label: mod.group }, { label: def.label }]}
        actions={
          <>
            <button className="btn" onClick={() => download(`/${def.path}/export.csv?${params}`, `${def.path}.csv`)}><Icon name="Download" size={16} />{t("Export")}</button>
            {canWrite(def.path) && !def.readonly && (
              <Link className="btn btn-primary" href={`/m/${def.path}/new`}><Icon name="Plus" size={16} />{t("New")} {def.singular.toLowerCase()}</Link>
            )}
          </>
        }
      />
      <div className="card">
        <div className="toolbar">
          <div className="grow" style={{ position: "relative" }}>
            <Icon name="Search" size={16} style={{ position: "absolute", left: 10, top: 9, color: "var(--text-3)" }} />
            <input className="input" style={{ paddingLeft: 32, width: "100%" }} placeholder={`${t("Search")} ${def.label.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Search ${def.label}`} />
          </div>
          {filterFields.map((f) => (
            <select key={f.name} className="select" value={filters[f.name] ?? ""} onChange={(e) => setFilters((x) => ({ ...x, [f.name]: e.target.value }))} aria-label={`Filter by ${f.label}`}>
              <option value="">{f.label}: {t("all")}</option>
              {f.options.map((o) => <option key={o} value={o}>{humanize(o)}</option>)}
            </select>
          ))}
          {refFilters.map(([k]) => (
            <button key={k} className="btn btn-sm" onClick={() => setFilters((x) => { const n = { ...x }; delete n[k]; return n; })}>
              {def.fields.find((f) => f.name === k)?.label} filter <Icon name="X" size={14} />
            </button>
          ))}
          <button className="btn btn-ghost icon-btn" onClick={load} aria-label={t("Refresh")} title={t("Refresh")}><Icon name="RefreshCw" size={16} /></button>
        </div>
        {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={load} /> : data && data.items.length === 0 ? (
          <Empty title={t("No records found")} hint={debounced || Object.keys(filters).length ? t("Try clearing the search or filters.") : def.readonly ? "Records appear here as the domain creates them." : `Create the first ${def.singular.toLowerCase()} to get started.`}
            icon={def.icon} action={canWrite(def.path) && !def.readonly ? <Link className="btn btn-primary btn-sm" href={`/m/${def.path}/new`}><Icon name="Plus" size={14} />{t("New")}</Link> : undefined} />
        ) : data && (
          <div className="table-wrap" style={{ opacity: loading ? 0.6 : 1 }}>
            <table className="table">
              <thead>
                <tr>
                  {cols.map((f) => (
                    <th key={f.name} className={["int", "dec", "money"].includes(f.type) ? "num" : undefined} aria-sort={sort.startsWith(f.name + ",") ? (sort.endsWith("asc") ? "ascending" : "descending") : undefined}>
                      {f.computed ? f.label : (
                        <button onClick={() => toggleSort(f.name)}>{f.label}{sort.startsWith(f.name + ",") && <Icon name={sort.endsWith("asc") ? "ChevronUp" : "ChevronDown"} size={12} />}</button>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id} className="clickable" tabIndex={0} onClick={() => router.push(`/m/${def.path}/${r.id}`)} onKeyDown={(e) => { if (e.key === "Enter") router.push(`/m/${def.path}/${r.id}`); }}>
                    {cols.map((f, i) => (
                      <td key={f.name}>{i === 0 ? <Link href={`/m/${def.path}/${r.id}`} onClick={(e) => e.stopPropagation()}>{cellFor(def, f.name, r)}</Link> : cellFor(def, f.name, r)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > 0 && (
          <div className="card-foot">
            <span className="small muted">{data.total.toLocaleString()} {t(data.total === 1 ? "record" : "records")} · {t("page")} {page + 1} {t("of")} {pages}</span>
            <div className="row">
              <button className="btn btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}><Icon name="ChevronLeft" size={14} />{t("Previous")}</button>
              <button className="btn btn-sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>{t("Next")}<Icon name="ChevronRight" size={14} /></button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
