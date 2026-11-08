"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SyncBar, useOnline } from "@/components/SyncBar";
import { Alert, Badge, Empty, Loading, useToast } from "@/components/ui";
import { api, type Page } from "@/lib/api";
import { dateTime, num } from "@/lib/format";
import { Icon } from "@/lib/icons";
import { jobCache, queue } from "@/lib/offline";

type R = Record<string, unknown>;

export default function TechnicianJob() {
  const { id } = useParams<{ id: string }>();
  const online = useOnline();
  const toast = useToast();
  const [job, setJob] = useState<R | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timerStart, setTimerStart] = useState<string | null>(null);
  const [reading, setReading] = useState<{ meterId: string; value: string }>({ meterId: "", value: "" });
  const [notes, setNotes] = useState("");

  const load = async () => {
    try {
      const wo = await api<R>(`/work-orders/${id}`);
      const [tasks, meters, permit, techs] = await Promise.all([
        api<Page>(`/work-tasks?workOrderId=${id}&size=100&sort=sequence,asc`),
        wo.assetId ? api<Page>(`/meters?assetId=${wo.assetId}&size=20`) : Promise.resolve({ items: [] } as unknown as Page),
        wo.permitId ? api<R>(`/work-permits/${wo.permitId}`).catch(() => null) : Promise.resolve(null),
        api<{ technician: R | null }>("/technician/my-work").catch(() => ({ technician: null })),
      ]);
      const data = { wo, tasks: tasks.items, meters: meters.items, permit, technician: techs.technician };
      setJob(data);
      setStale(false);
      jobCache.set(id, { ...wo, _bundle: data });
    } catch (e) {
      const c = jobCache.get(id);
      if (c?._bundle) { setJob(c._bundle as R); setStale(true); } else setError((e as Error).message);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); try { setTimerStart(window.localStorage.getItem(`opes.timer.${id}`)); } catch { /* ignore */ } }, [id]);

  if (error && !job) return <div className="mobile-frame"><Alert tone="danger">{error}</Alert></div>;
  if (!job) return <Loading />;
  const wo = job.wo as R;
  const tasks = job.tasks as R[];
  const meters = job.meters as R[];
  const permit = job.permit as R | null;
  const tech = job.technician as R | null;
  const status = String(wo.status);

  const act = async (type: "TASK_RECORD" | "WO_TRANSITION" | "METER_READING" | "TIME_ENTRY", payload: R, label: string) => {
    if (online && type === "WO_TRANSITION") {
      try {
        await api(`/work-orders/${id}:transition`, { body: payload, headers: { "If-Match": String(wo.version) } });
        toast(label);
        load();
      } catch (e) { toast((e as Error).message, "err"); }
      return;
    }
    if (online && type === "TASK_RECORD") {
      try { await api(`/work-orders/${id}/tasks/${payload.taskId}:record`, { body: payload }); toast(label); load(); } catch (e) { toast((e as Error).message, "err"); }
      return;
    }
    queue.add({ type, label: `${wo.number}: ${label}`, baseVersion: Number(wo.version), payload: { workOrderId: id, ...payload } });
    toast(online ? `${label} — queued for sync` : `${label} — saved offline`, "info");
  };

  const toggleTimer = () => {
    if (!timerStart) {
      const now = new Date().toISOString();
      setTimerStart(now);
      try { window.localStorage.setItem(`opes.timer.${id}`, now); } catch { /* ignore */ }
      return;
    }
    if (!tech) { toast("No technician profile is linked to your account", "err"); return; }
    queue.add({ type: "TIME_ENTRY", label: `${wo.number}: labor ${new Date(timerStart).toLocaleTimeString()}–${new Date().toLocaleTimeString()}`,
      payload: { workOrderId: id, technicianId: tech.id, startedAt: timerStart, endedAt: new Date().toISOString(), laborType: "REGULAR", note: "Mobile timer" } });
    setTimerStart(null);
    try { window.localStorage.removeItem(`opes.timer.${id}`); } catch { /* ignore */ }
    toast("Labor time queued", "info");
  };

  const pendingRequired = tasks.filter((t) => t.required && t.status === "PENDING").length;
  return (
    <div className="mobile-frame stack" style={{ gap: 12 }}>
      <Link href="/technician" className="btn btn-ghost" style={{ alignSelf: "flex-start" }}><Icon name="ChevronLeft" size={16} />My work</Link>
      <SyncBar onSynced={load} />
      {stale && <Alert tone="warn">Showing last-known data cached {dateTime((jobCache.get(id) as R)?.cachedAt)}. Statuses may have changed.</Alert>}
      <div className="card">
        <div className="card-body stack" style={{ gap: 8 }}>
          <div className="row between"><span className="mono small muted">{String(wo.number)}</span><Badge value={status} /></div>
          <h1>{String(wo.title)}</h1>
          <div className="row"><Badge value={wo.priority} /><Badge value={wo.workType} plain tone="tone-info" /></div>
          {wo.description ? <p className="muted">{String(wo.description)}</p> : null}
          <div className="small"><Icon name="Boxes" size={13} /> {String(wo.assetSnapshot ?? wo.assetIdLabel ?? "No asset")}</div>
          <div className="small muted"><Icon name="Clock" size={13} /> Due {dateTime(wo.dueAt)}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2><Icon name="HardHat" size={16} /> Safety briefing</h2></div>
        <div className="card-body stack" style={{ gap: 8 }}>
          {wo.permitRequired ? (
            permit ? <Alert tone={permit.status === "ACTIVE" ? "ok" : "warn"}>Permit {String(permit.number)} is <strong>{String(permit.status).toLowerCase()}</strong> (last known). Starting work re-validates the permit online.<br /><span className="small">Hazards: {String(permit.hazards)}</span><br /><span className="small">Controls: {String(permit.controls)}</span></Alert>
              : <Alert tone="danger">A work permit is required but none is linked. Work cannot start.</Alert>
          ) : <Alert tone="info">No permit required. Follow site LOTO procedures and wear the required PPE.</Alert>}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Actions</h2></div>
        <div className="card-body stack" style={{ gap: 8 }}>
          {status === "DISPATCHED" && <button className="btn btn-primary big-btn" onClick={() => act("WO_TRANSITION", { to: "IN_PROGRESS" }, "Start work")} disabled={!online && !!wo.permitRequired}><Icon name="Play" size={18} />Start work</button>}
          {status === "DISPATCHED" && !online && wo.permitRequired ? <div className="small muted">Permit-bound work can only be started online.</div> : null}
          {status === "IN_PROGRESS" && <button className="btn btn-primary big-btn" onClick={() => act("WO_TRANSITION", { to: "WORK_COMPLETED", completionNotes: notes || undefined }, "Submit completion")} disabled={pendingRequired > 0}><Icon name="CircleCheck" size={18} />Submit completion{pendingRequired ? ` (${pendingRequired} task(s) left)` : ""}</button>}
          {status === "IN_PROGRESS" && <textarea className="textarea" placeholder="Completion notes" value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Completion notes" />}
          <button className="btn big-btn" onClick={toggleTimer}><Icon name="Timer" size={18} />{timerStart ? `Stop timer (started ${new Date(timerStart).toLocaleTimeString()})` : "Start labor timer"}</button>
          <Link className="btn big-btn" href={`/m/work-orders/${id}`}><Icon name="ExternalLink" size={18} />Full work order</Link>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Checklist</h2><span className="small muted">{tasks.filter((t) => t.status !== "PENDING").length}/{tasks.length} done</span></div>
        {tasks.length === 0 ? <Empty title="No tasks" icon="ListChecks" /> : tasks.map((t) => (
          <div key={String(t.id)} className="check-item">
            <Icon name={t.status === "DONE" ? "CircleCheck" : t.status === "FAILED" ? "CircleX" : "Circle"} size={22} style={{ color: t.status === "DONE" ? "var(--ok)" : t.status === "FAILED" ? "var(--danger)" : "var(--text-3)", flex: "0 0 auto" }} />
            <div style={{ flex: 1 }}><div>{String(t.description)}</div>{t.result ? <div className="small muted">{String(t.result)}</div> : null}</div>
            {status === "IN_PROGRESS" && t.status === "PENDING" && (
              <div className="row" style={{ flex: "0 0 auto" }}>
                <button className="btn btn-sm" onClick={() => act("TASK_RECORD", { taskId: t.id, status: "DONE" }, `Task ${t.sequence} done`)} aria-label={`Mark task ${t.sequence} done`}><Icon name="Check" size={14} /></button>
                <button className="btn btn-sm btn-danger" onClick={() => act("TASK_RECORD", { taskId: t.id, status: "FAILED" }, `Task ${t.sequence} failed`)} aria-label={`Mark task ${t.sequence} failed`}><Icon name="X" size={14} /></button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head"><h2>Meter reading</h2></div>
        <div className="card-body stack" style={{ gap: 8 }}>
          {meters.length === 0 ? <div className="small muted">This asset has no meters.</div> : (
            <>
              <select className="select" value={reading.meterId} onChange={(e) => setReading({ ...reading, meterId: e.target.value })} aria-label="Meter">
                <option value="">Select meter…</option>
                {meters.map((m) => <option key={String(m.id)} value={String(m.id)}>{String(m.name)} (last {num(m.lastReading)} {String(m.unit)})</option>)}
              </select>
              <input className="input" type="number" inputMode="decimal" placeholder="Value" value={reading.value} onChange={(e) => setReading({ ...reading, value: e.target.value })} aria-label="Reading value" />
              <button className="btn" disabled={!reading.meterId || !reading.value} onClick={() => { queue.add({ type: "METER_READING", label: `${wo.number}: meter reading ${reading.value}`, payload: { meterId: reading.meterId, value: reading.value, readingAt: new Date().toISOString(), source: "MOBILE" } }); setReading({ meterId: "", value: "" }); toast("Reading queued", "info"); }}>
                <Icon name="Gauge" size={16} />Record reading
              </button>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Photo evidence</h2></div>
        <div className="card-body stack" style={{ gap: 8 }}>
          <PhotoUpload woId={id} woNumber={String(wo.number)} online={online} />
        </div>
      </div>
    </div>
  );
}

function PhotoUpload({ woId, woNumber, online }: { woId: string; woNumber: string; online: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const doc = await api<R>("/documents", { body: { title: `Photo — ${woNumber} — ${new Date().toLocaleString()}`, docType: "PHOTO", entityType: "Work Order", entityId: woId, confidential: false } });
      const fd = new FormData();
      fd.append("file", file);
      await api(`/documents/${doc.id}/file`, { body: fd });
      toast("Photo uploaded");
    } catch (e) { toast((e as Error).message, "err"); } finally { setBusy(false); }
  };
  if (!online) return <div className="small muted">Photo upload needs a connection. Take the photo now and upload when back online.</div>;
  return (
    <label className="btn big-btn">
      <Icon name="Camera" size={18} />{busy ? "Uploading…" : "Take or choose photo"}
      <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
    </label>
  );
}
