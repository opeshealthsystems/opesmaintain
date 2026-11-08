"use client";
import { api } from "./api";

export type SyncState = "QUEUED" | "SYNCING" | "ACCEPTED" | "CONFLICT" | "REJECTED" | "REQUIRES_ONLINE_REVIEW";

export interface QueuedOp {
  clientOperationId: string;
  type: "TASK_RECORD" | "WO_TRANSITION" | "METER_READING" | "TIME_ENTRY";
  label: string;
  baseVersion?: number;
  payload: Record<string, unknown>;
  state: SyncState;
  message?: string;
  queuedAt: string;
}

const KEY = "opes.syncQueue";
const CACHE = "opes.jobCache";

function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "") as T;
  } catch {
    return fallback;
  }
}
function write(key: string, v: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage full or blocked */
  }
  window.dispatchEvent(new Event("opes-queue"));
}

export const queue = {
  all: (): QueuedOp[] => read<QueuedOp[]>(KEY, []),
  add(op: Omit<QueuedOp, "clientOperationId" | "state" | "queuedAt">) {
    const item: QueuedOp = { ...op, clientOperationId: crypto.randomUUID(), state: "QUEUED", queuedAt: new Date().toISOString() };
    write(KEY, [...queue.all(), item]);
    return item;
  },
  clearFinished() {
    write(KEY, queue.all().filter((o) => !["ACCEPTED"].includes(o.state)));
  },
  remove(id: string) {
    write(KEY, queue.all().filter((o) => o.clientOperationId !== id));
  },
};

export function deviceId(): string {
  try {
    let id = window.localStorage.getItem("opes.device");
    if (!id) {
      id = `WEB-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      window.localStorage.setItem("opes.device", id);
    }
    return id;
  } catch {
    return "WEB-UNKNOWN";
  }
}

/** Pushes queued operations; the server re-validates each one and returns an authoritative outcome. */
export async function syncNow(): Promise<{ accepted: number; problems: number }> {
  const pending = queue.all().filter((o) => o.state === "QUEUED" || o.state === "SYNCING");
  if (!pending.length) return { accepted: 0, problems: 0 };
  write(KEY, queue.all().map((o) => (pending.some((p) => p.clientOperationId === o.clientOperationId) ? { ...o, state: "SYNCING" as SyncState } : o)));
  try {
    const r = await api<{ results: { clientOperationId: string; outcome: SyncState; message: string }[] }>("/mobile/sync/operations", {
      body: { deviceId: deviceId(), operations: pending.map((o) => ({ clientOperationId: o.clientOperationId, type: o.type, baseVersion: o.baseVersion, payload: o.payload })) },
    });
    const by = new Map(r.results.map((x) => [x.clientOperationId, x]));
    write(KEY, queue.all().map((o) => (by.has(o.clientOperationId) ? { ...o, state: by.get(o.clientOperationId)!.outcome, message: by.get(o.clientOperationId)!.message } : o)));
    return { accepted: r.results.filter((x) => x.outcome === "ACCEPTED").length, problems: r.results.filter((x) => x.outcome !== "ACCEPTED").length };
  } catch (e) {
    write(KEY, queue.all().map((o) => (o.state === "SYNCING" ? { ...o, state: "QUEUED" as SyncState } : o)));
    throw e;
  }
}

export const jobCache = {
  get: (id: string) => read<Record<string, Record<string, unknown>>>(CACHE, {})[id],
  set(id: string, data: Record<string, unknown>) {
    const all = read<Record<string, Record<string, unknown>>>(CACHE, {});
    all[id] = { ...data, cachedAt: new Date().toISOString() };
    write(CACHE, all);
  },
  list: () => read<Record<string, Record<string, unknown>>>(CACHE, {}),
};
