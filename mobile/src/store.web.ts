// Web build of the offline store (used for browser-based end-to-end tests and previews).
// Native builds use store.ts (SQLCipher). Same API, backed by localStorage.
export type OpState = "QUEUED" | "SYNCING" | "ACCEPTED" | "CONFLICT" | "REJECTED" | "REQUIRES_ONLINE_REVIEW";
export interface Op { id: string; type: string; label: string; base_version: number | null; payload: string; state: OpState; message: string | null; queued_at: string }
const read = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? "") as T; } catch { return d; } };
const write = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));

export async function getKv(k: string): Promise<string | null> { return read<Record<string, string>>("kv", {})[k] ?? null; }
export async function setKv(k: string, v: string | null) { const m = read<Record<string, string>>("kv", {}); if (v === null) delete m[k]; else m[k] = v; write("kv", m); }
export async function enqueue(type: string, label: string, payload: Record<string, unknown>, baseVersion?: number) {
  write("op", [...read<Op[]>("op", []), { id: crypto.randomUUID(), type, label, base_version: baseVersion ?? null, payload: JSON.stringify(payload), state: "QUEUED", message: null, queued_at: new Date().toISOString() }]);
}
export async function ops(): Promise<Op[]> { return read<Op[]>("op", []).slice().reverse(); }
export async function setOp(id: string, state: OpState, message: string | null) { write("op", read<Op[]>("op", []).map((o) => (o.id === id ? { ...o, state, message } : o))); }
export async function cacheJob(id: string, data: unknown) { const m = read<Record<string, { data: string; cached_at: string }>>("job", {}); m[id] = { data: JSON.stringify(data), cached_at: new Date().toISOString() }; write("job", m); }
export async function cachedJobs() { return Object.entries(read<Record<string, { data: string; cached_at: string }>>("job", {})).map(([id, v]) => ({ id, ...v })); }
export async function wipe() { ["kv", "op", "job"].forEach((k) => localStorage.removeItem(k)); }
