"use client";
import { useEffect, useState } from "react";
import { queue, syncNow, type QueuedOp } from "@/lib/offline";
import { Icon } from "@/lib/icons";
import { Badge, useToast } from "./ui";

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

export function useQueue() {
  const [items, setItems] = useState<QueuedOp[]>([]);
  useEffect(() => {
    const load = () => setItems(queue.all());
    load();
    window.addEventListener("opes-queue", load);
    window.addEventListener("storage", load);
    return () => { window.removeEventListener("opes-queue", load); window.removeEventListener("storage", load); };
  }, []);
  return items;
}

/** Always-visible connectivity and sync status for technicians (spec §10.5). */
export function SyncBar({ onSynced }: { onSynced?: () => void }) {
  const online = useOnline();
  const items = useQueue();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const pending = items.filter((i) => i.state === "QUEUED" || i.state === "SYNCING").length;
  const problems = items.filter((i) => ["CONFLICT", "REJECTED", "REQUIRES_ONLINE_REVIEW"].includes(i.state)).length;
  const sync = async () => {
    try {
      const r = await syncNow();
      toast(r.problems ? `${r.accepted} synced, ${r.problems} need attention` : `${r.accepted} change(s) synced`, r.problems ? "err" : "ok");
      onSynced?.();
    } catch (e) { toast((e as Error).message, "err"); }
  };
  useEffect(() => { if (online && pending > 0) sync(); /* auto-sync on reconnect */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="row between" style={{ padding: "10px 14px" }}>
        <div className="row">
          <Icon name={online ? "Wifi" : "WifiOff"} size={18} style={{ color: online ? "var(--ok)" : "var(--warn)" }} />
          <strong>{online ? "Online" : "Offline — changes are queued on this device"}</strong>
        </div>
        <div className="row">
          <button className="btn btn-sm" onClick={() => setOpen(!open)} aria-expanded={open}><Icon name="CloudUpload" size={14} />Queue {pending}{problems ? ` · ${problems} issue(s)` : ""}</button>
          <button className="btn btn-sm btn-primary" onClick={sync} disabled={!online || pending === 0}><Icon name="RefreshCw" size={14} />Sync</button>
        </div>
      </div>
      {open && (
        <div style={{ borderTop: "1px solid var(--border)" }}>
          {items.length === 0 ? <div className="state small">No queued changes.</div> : items.slice().reverse().map((o) => (
            <div key={o.clientOperationId} className="check-item">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>{o.label}</div>
                <div className="small muted">{new Date(o.queuedAt).toLocaleString()}{o.message ? ` · ${o.message}` : ""}</div>
              </div>
              <Badge value={o.state} />
              {o.state !== "QUEUED" && o.state !== "SYNCING" && <button className="btn btn-sm btn-ghost" onClick={() => queue.remove(o.clientOperationId)} aria-label="Dismiss"><Icon name="X" size={14} /></button>}
            </div>
          ))}
          {items.some((i) => i.state === "ACCEPTED") && <div style={{ padding: 10 }}><button className="btn btn-sm" onClick={() => queue.clearFinished()}>Clear synced</button></div>}
        </div>
      )}
    </div>
  );
}
