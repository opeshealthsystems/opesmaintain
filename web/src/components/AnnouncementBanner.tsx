"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/lib/icons";

type Announcement = { id: string; title: string; body: string; level: string };
const KEY = "opes.dismissedAnnouncements";

/** Announcements published by OPES operators, shown at the top of the customer's app until dismissed. */
export function AnnouncementBanner() {
  const { user } = useAuth();
  const [items, setItems] = useState<Announcement[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => {
    if (!user || user.platformOperator) return;
    try { setHidden(JSON.parse(window.localStorage.getItem(KEY) ?? "[]")); } catch { /* storage blocked */ }
    api<Announcement[]>("/announcements/active").then(setItems).catch(() => setItems([]));
  }, [user]);
  const visible = items.filter((a) => !hidden.includes(a.id));
  if (!visible.length) return null;
  const dismiss = (id: string) => {
    const next = [...hidden, id];
    setHidden(next);
    try { window.localStorage.setItem(KEY, JSON.stringify(next.slice(-50))); } catch { /* storage blocked */ }
  };
  return (
    <>
      {visible.map((a) => (
        <div key={a.id} className={`announce announce-${a.level.toLowerCase()}`} role="status">
          <Icon name={a.level === "MAINTENANCE" ? "Wrench" : a.level === "WARNING" ? "TriangleAlert" : "Megaphone"} size={16} />
          <span><b>{a.title}</b> — {a.body}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => dismiss(a.id)} aria-label="Dismiss"><Icon name="X" size={14} /></button>
        </div>
      ))}
    </>
  );
}
