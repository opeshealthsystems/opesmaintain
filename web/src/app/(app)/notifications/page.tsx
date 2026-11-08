"use client";
import Link from "next/link";
import { Empty, ErrorState, Loading, PageHeader, useData } from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { Icon } from "@/lib/icons";

export default function Notifications() {
  const t = useT();
  const { data, error, loading, reload } = useData(() => api<{ id: string; subject: string; body: string; link: string; status: string; createdAt: string }[]>("/notifications/mine"), []);
  const read = async (id: string) => { await api(`/notifications/${id}:read`, { method: "POST" }).catch(() => {}); reload(); };
  return (
    <>
      <PageHeader icon="Bell" title={t("Notifications")} subtitle="Messages for you and your role." />
      <div className="card">
        {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !data!.length ? <Empty title="You are all caught up" icon="Bell" /> : data!.map((n) => (
          <div key={n.id} className="check-item">
            <Icon name={n.status === "UNREAD" ? "CircleDot" : "Circle"} size={16} style={{ color: n.status === "UNREAD" ? "var(--accent)" : "var(--text-3)", marginTop: 3 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: n.status === "UNREAD" ? 600 : 400 }}>{n.link ? <Link href={n.link}>{n.subject}</Link> : n.subject}</div>
              <div className="small muted">{n.body}</div><div className="small muted">{dateTime(n.createdAt)}</div>
            </div>
            {n.status === "UNREAD" && <button className="btn btn-sm" onClick={() => read(n.id)}>Mark read</button>}
          </div>
        ))}
      </div>
    </>
  );
}
