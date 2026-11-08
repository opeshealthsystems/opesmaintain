"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, download, type Page } from "@/lib/api";
import { PRINTABLE, visibleActions } from "@/lib/actions";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { Icon } from "@/lib/icons";
import { modules, relatedOf, resource, type ResourceDef } from "@/lib/registry";
import { formatValue, humanize } from "@/lib/format";
import { ActionRunner, type RunSpec } from "./ActionRunner";
import { cellFor, RecordTable } from "./ResourceList";
import { AssetReliability, AssetTree, AuditTrail, DocumentFile, PartStockActions, PassportPanel, PmForecast, StockTable, WorkOrderExecution } from "./panels";
import { Badge, Empty, ErrorState, Loading, Modal, PageHeader, useData, useToast } from "./ui";

const HEADER_BADGES = ["status", "priority", "criticality", "safetyState", "outcome", "severity", "eligibility", "availability"];
const NEEDS_REASON = new Set(["ON_HOLD", "CANCELLED", "REOPEN"]);
const LOCKED = new Set(["CLOSED", "CANCELLED", "RETIRED", "DISPOSED", "REVOKED", "EXPIRED", "SUPERSEDED"]);
const AUDIT_ROLES = ["MANAGER", "AUDITOR"];

interface Tab { key: string; label: string; icon?: string }

export function ResourceDetail({ def, id }: { def: ResourceDef; id: string }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const { user, canWrite, hasRole } = useAuth();
  const { data: row, error, loading, reload } = useData(() => api<Record<string, unknown>>(`/${def.path}/${id}`), [def.path, id]);
  const [tab, setTab] = useState("details");
  const [run, setRun] = useState<(RunSpec & { navigate?: string; showResult?: boolean }) | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [transitions, setTransitions] = useState<string[]>([]);

  useEffect(() => {
    if (def.path === "work-orders" && row) api<string[]>(`/work-orders/${id}/transitions`).then(setTransitions).catch(() => setTransitions([]));
  }, [def.path, id, row]);

  const related = useMemo(() => relatedOf(def.path).filter(({ res }) => {
    if (res.path === "audit-events" || res.path === "outbox-events") return false;
    if (user?.role === "CUSTOMER") return ["work-orders", "maintenance-requests", "service-signoffs", "quotes", "assets"].includes(res.path);
    if (["delegations", "devices"].includes(res.path)) return hasRole("MANAGER", "AUDITOR");
    return true;
  }), [def.path, user, hasRole]);

  const tabs: Tab[] = useMemo(() => {
    const list: Tab[] = [{ key: "details", label: t("Details"), icon: "FileText" }];
    if (def.path === "work-orders") list.push({ key: "execution", label: t("Execution & cost"), icon: "Wrench" });
    if (def.path === "assets") list.push({ key: "passport", label: t("QR passport"), icon: "QrCode" }, { key: "tree", label: t("Hierarchy"), icon: "Network" }, { key: "reliability", label: t("Reliability"), icon: "Activity" });
    if (def.path === "pm-plans") list.push({ key: "forecast", label: t("Forecast"), icon: "CalendarDays" });
    if (def.path === "parts") list.push({ key: "stock", label: t("Stock by warehouse"), icon: "Package" });
    if (def.path === "warehouses") list.push({ key: "stock", label: t("Stock on hand"), icon: "Package" });
    if (def.path === "documents") list.push({ key: "file", label: t("File"), icon: "Paperclip" });
    if (["assets", "customers", "sites", "work-orders"].includes(def.path)) list.push({ key: "docs", label: t("Documents"), icon: "FileText" });
    const counts = new Map<string, number>();
    for (const r of related) counts.set(r.res.path, (counts.get(r.res.path) ?? 0) + 1);
    for (const r of related) {
      const child = r.field.name === "parentId" || r.field.name === "parentWorkOrderId";
      const label = child ? `${r.res.label} (${t("children")})` : (counts.get(r.res.path) ?? 0) > 1 ? `${r.res.label} (${r.field.label.toLowerCase()})` : r.res.label;
      list.push({ key: `rel:${r.res.path}:${r.field.name}`, label, icon: r.res.icon });
    }
    if (hasRole(...AUDIT_ROLES)) list.push({ key: "history", label: t("History"), icon: "History" });
    return list;
  }, [def.path, related, hasRole, t]);

  if (loading && !row) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!row) return null;

  const mod = modules[def.module];
  const status = String(row.status ?? "");
  const editable = canWrite(def.path) && !def.readonly && !LOCKED.has(status);
  const actions = visibleActions(def.path, row, user);
  const printable = PRINTABLE[def.path];

  const runTransition = (to: string) => {
    const fields = [] as RunSpec["fields"];
    if (NEEDS_REASON.has(to)) fields!.push({ name: "reason", label: "Reason", type: "textarea", required: true });
    if (to === "CLOSED") fields!.push({ name: "closeoutCode", label: "Closeout code", type: "enum", required: true, options: ["FIXED", "NO_FAULT_FOUND", "TEMPORARY_REPAIR", "REPLACED", "DEFERRED", "NOT_REPAIRABLE"] });
    if (to === "WORK_COMPLETED") fields!.push({ name: "completionNotes", label: "Completion notes", type: "textarea" });
    if (to === "REOPEN") {
      setRun({ title: "Reopen as follow-up work order", endpoint: `/work-orders/${id}:reopen`, fields, navigate: "work-orders" });
      return;
    }
    setRun({ title: `Move to ${humanize(to === "RESUME" ? "resume work" : to)}`, endpoint: `/work-orders/${id}:transition`, fields,
      body: { to }, headers: { "If-Match": String(row.version) }, danger: to === "CANCELLED", submitLabel: humanize(to === "RESUME" ? "Resume" : to) });
  };

  const fields = def.fields;
  return (
    <>
      <PageHeader
        icon={def.icon}
        crumbs={[{ href: "/modules", label: mod.group }, { href: `/m/${def.path}`, label: def.label }, { label: String(row._label) }]}
        title={String(row._label)}
        subtitle={
          <span className="row" style={{ gap: 6, marginTop: 4 }}>
            {HEADER_BADGES.filter((b) => def.fields.some((f) => f.name === b) && row[b]).map((b) => <Badge key={b} value={row[b]} />)}
            {row.slaBreached === true && <Badge value="BREACHED" tone="tone-danger" />}
            <span className="small muted">{def.singular} · {t("updated")} {formatValue({ name: "u", label: "", type: "datetime", ref: null, options: [], required: false, list: false, managed: false, computed: false, guarded: false }, { u: row.updatedAt })}</span>
          </span>
        }
        actions={
          <>
            {def.path === "work-orders" && transitions.map((to) => (
              <button key={to} className={`btn ${["CANCELLED"].includes(to) ? "btn-danger" : ["ON_HOLD", "REOPEN", "RESUME"].includes(to) ? "" : "btn-primary"}`} onClick={() => runTransition(to)}>
                <Icon name={to === "CANCELLED" ? "Ban" : to === "ON_HOLD" ? "Pause" : to === "REOPEN" ? "RotateCcw" : to === "RESUME" ? "Play" : "ArrowRight"} size={16} />
                {to === "REOPEN" ? t("Reopen") : to === "RESUME" ? t("Resume") : to === "ON_HOLD" ? t("Hold") : to === "CANCELLED" ? t("Cancel") : humanize(to)}
              </button>
            ))}
            {actions.map((a) => (
              <button key={a.key} className={`btn ${a.danger ? "btn-danger" : ""}`} onClick={() => setRun({ title: a.label, endpoint: a.endpoint(id), fields: a.fields, confirm: a.confirm, danger: a.danger, body: a.body, navigate: a.navigate, showResult: a.showResult })}>
                <Icon name={a.icon} size={16} />{a.label}
              </button>
            ))}
            {def.path === "users" && hasRole("ADMIN") && (
              <button className="btn" onClick={() => download(`/users/${id}/personal-data`, `personal-data-${id}.json`).then(() => toast("Export downloaded")).catch((e) => toast((e as Error).message, "err"))}>
                <Icon name="FileDown" size={16} />{t("Export personal data")}
              </button>
            )}
            {printable && <Link className="btn" href={`/print/${printable}/${id}`}><Icon name="Printer" size={16} />{t("Print")}</Link>}
            {editable && <Link className="btn" href={`/m/${def.path}/${id}/edit`}><Icon name="Pencil" size={16} />{t("Edit")}</Link>}
          </>
        }
      />
      <div className="card">
        <div className="tabs" role="tablist">
          {tabs.map((tb) => (
            <button key={tb.key} role="tab" className="tab" aria-selected={tab === tb.key} onClick={() => setTab(tb.key)}>
              {tb.icon && <Icon name={tb.icon} size={15} />}{tb.label}
            </button>
          ))}
        </div>
        <div role="tabpanel">
          {tab === "details" && (
            <dl className="dl">
              {fields.map((f) => (
                <div key={f.name} className={f.type === "text" ? "wide" : undefined}>
                  <dt>{f.label}</dt>
                  <dd className={f.type === "text" ? "pre" : undefined}>
                    {f.type === "ref" && row[f.name] ? <Link href={`/m/${f.ref}/${row[f.name]}`}>{String(row[`${f.name}Label`])}</Link>
                      : f.type === "enum" || f.type === "bool" ? cellFor(def, f.name, row) : formatValue(f, row)}
                  </dd>
                </div>
              ))}
              <div><dt>{t("Created")}</dt><dd>{formatValue({ ...fields[0], type: "datetime" }, { [fields[0].name]: row.createdAt })} · {String(row.createdBy ?? "—")}</dd></div>
              <div><dt>{t("Record version")}</dt><dd className="mono">{String(row.version)}</dd></div>
            </dl>
          )}
          {tab === "execution" && <WorkOrderExecution wo={row} onChanged={reload} />}
          {tab === "passport" && <PassportPanel id={id} />}
          {tab === "tree" && <AssetTree id={id} />}
          {tab === "reliability" && <AssetReliability id={id} />}
          {tab === "forecast" && <PmForecast id={id} />}
          {tab === "stock" && def.path === "parts" && <><PartStockActions partId={id} onDone={reload} /><StockTable key={String(row.version)} url={`/parts/${id}/stock`} showWarehouse /></>}
          {tab === "stock" && def.path === "warehouses" && <StockTable url={`/warehouses/${id}/stock`} showWarehouse={false} />}
          {tab === "file" && <DocumentFile doc={row} onChanged={reload} />}
          {tab === "docs" && <RelatedDocs entityId={id} entityType={def.singular} />}
          {tab === "history" && <AuditTrail entityId={id} />}
          {tab.startsWith("rel:") && <RelatedTab tabKey={tab} parentId={id} />}
        </div>
      </div>
      {result && (
        <Modal title="Result" onClose={() => setResult(null)} footer={<button className="btn btn-primary" onClick={() => setResult(null)}>Close</button>}>
          <dl className="stack" style={{ gap: 10 }}>
            {Object.entries(result).map(([k, v]) => <div key={k}><dt className="small muted">{humanize(k)}</dt><dd className="mono" style={{ margin: 0, overflowWrap: "anywhere" }}>{String(v)}</dd></div>)}
          </dl>
        </Modal>
      )}
      {run && (
        <ActionRunner spec={run} onClose={() => setRun(null)} onDone={(r) => {
          const nav = run.navigate;
          const show = run.showResult;
          setRun(null);
          if (show) { setResult(r); return; }
          toast(t("Action completed"));
          if (nav && r?.id && r.id !== id) router.push(`/m/${nav}/${r.id}`);
          else reload();
        }} />
      )}
    </>
  );
}

function RelatedTab({ tabKey, parentId }: { tabKey: string; parentId: string }) {
  const t = useT();
  const [, path, fieldName] = tabKey.split(":");
  const def = resource(path)!;
  const router = useRouter();
  const { canWrite } = useAuth();
  const { data, error, loading } = useData(() => api<Page>(`/${path}?${fieldName}=${parentId}&size=50`), [path, fieldName, parentId]);
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  const columns = def.fields.filter((f) => f.list && f.name !== fieldName).map((f) => f.name);
  return (
    <>
      <div className="row between" style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <span className="small muted">{data!.total} record{data!.total === 1 ? "" : "s"}</span>
        <div className="row">
          <Link className="btn btn-sm" href={`/m/${path}?${fieldName}=${parentId}`}><Icon name="ExternalLink" size={14} />{t("Open list")}</Link>
          {canWrite(path) && !def.readonly && <Link className="btn btn-sm btn-primary" href={`/m/${path}/new?${fieldName}=${parentId}`}><Icon name="Plus" size={14} />Add {def.singular.toLowerCase()}</Link>}
        </div>
      </div>
      {data!.items.length === 0 ? <Empty title={`No ${def.label.toLowerCase()}`} icon={def.icon} /> : (
        <RecordTable def={def} rows={data!.items} columns={columns} onOpen={(rid) => router.push(`/m/${path}/${rid}`)} />
      )}
    </>
  );
}

function RelatedDocs({ entityId, entityType }: { entityId: string; entityType: string }) {
  const def = resource("documents")!;
  const router = useRouter();
  const { canWrite } = useAuth();
  const { data, error, loading } = useData(() => api<Page>(`/documents?entityId=${entityId}&size=50`), [entityId]);
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  return (
    <>
      <div className="row between" style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <span className="small muted">Manuals, certificates, warranty evidence and reports linked to this {entityType.toLowerCase()}</span>
        {canWrite("documents") && <Link className="btn btn-sm btn-primary" href={`/m/documents/new?entityId=${entityId}&entityType=${encodeURIComponent(entityType)}`}><Icon name="Plus" size={14} />Add document</Link>}
      </div>
      {data!.items.length === 0 ? <Empty title="No documents" icon="FileText" /> : <RecordTable def={def} rows={data!.items} onOpen={(rid) => router.push(`/m/documents/${rid}`)} />}
    </>
  );
}
