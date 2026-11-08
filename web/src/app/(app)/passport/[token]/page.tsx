"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { RecordTable } from "@/components/ResourceList";
import { Badge, Empty, ErrorState, Loading, PageHeader, useData } from "@/components/ui";
import { api, type Page } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date } from "@/lib/format";
import { Icon } from "@/lib/icons";
import { resource } from "@/lib/registry";

/** Digital equipment passport resolved from a QR token (OM-M05). */
export default function Passport() {
  const { token } = useParams<{ token: string }>();
  const { canWrite } = useAuth();
  const asset = useData(() => api<Record<string, unknown>>(`/passport/${encodeURIComponent(token)}`), [token]);
  const id = asset.data?.id as string | undefined;
  const history = useData(() => (id ? api<Page>(`/work-orders?assetId=${id}&size=10`) : Promise.resolve(null)), [id]);
  const docs = useData(() => (id ? api<Page>(`/documents?entityId=${id}&size=20`) : Promise.resolve(null)), [id]);
  if (asset.loading) return <Loading />;
  if (asset.error) return <ErrorState error={asset.error} />;
  const a = asset.data!;
  return (
    <div className="stack">
      <PageHeader icon="QrCode" title={`${a.tag} · ${a.name}`} subtitle={`${a.manufacturer ?? ""} ${a.model ?? ""} · S/N ${a.serialNumber ?? "—"}`}
        actions={<>
          {canWrite("maintenance-requests") && <Link className="btn btn-primary" href={`/m/maintenance-requests/new?assetId=${id}&siteId=${a.siteId}`}><Icon name="TriangleAlert" size={16} />Report a fault</Link>}
          <Link className="btn" href={`/m/assets/${id}`}><Icon name="ExternalLink" size={16} />Asset record</Link>
        </>} />
      <div className="grid grid-4">
        <div className="card stat"><div className="label">Status</div><Badge value={a.status} /></div>
        <div className="card stat"><div className="label">Safety</div><Badge value={a.safetyState} /></div>
        <div className="card stat"><div className="label">Location</div><div>{String(a.siteIdLabel)}{a.locationIdLabel ? ` / ${a.locationIdLabel}` : ""}</div></div>
        <div className="card stat"><div className="label">Warranty</div><div>{a.warrantyEnd ? `${new Date(String(a.warrantyEnd)) > new Date() ? "Valid until" : "Expired"} ${date(a.warrantyEnd)}` : "—"}</div></div>
      </div>
      <div className="grid grid-2">
        <div className="card"><div className="card-head"><h2>Maintenance history</h2></div>
          {history.data && history.data.items.length ? <RecordTable def={resource("work-orders")!} rows={history.data.items} columns={["number", "title", "status", "dueAt"]} /> : <Empty title="No history" icon="History" />}
        </div>
        <div className="card"><div className="card-head"><h2>Manuals & certificates</h2></div>
          {docs.data && docs.data.items.length ? <RecordTable def={resource("documents")!} rows={docs.data.items} columns={["title", "docType", "status"]} /> : <Empty title="No documents" icon="FileText" />}
        </div>
      </div>
    </div>
  );
}
