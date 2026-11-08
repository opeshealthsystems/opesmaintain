import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import { enqueue, getKv, ops, setOp, setKv } from "./store";

const BASE = ((Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ?? "http://10.0.2.2:8080") + "/api/v1";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  const token = await getKv("token");
  const headers: Record<string, string> = { Accept: "application/json", ...(init.headers ?? {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(BASE + path, { method: init.method ?? (init.body ? "POST" : "GET"), headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
  } catch {
    throw new ApiError(0, "Offline");
  }
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiError(res.status, json.detail ?? `HTTP ${res.status}`);
  return json as T;
}

export async function login(email: string, password: string) {
  const r = await api<{ token: string; user: { fullName: string; role: string } }>("/auth/login", { body: { email, password } });
  await setKv("token", r.token);
  await setKv("user", JSON.stringify(r.user));
  return r.user;
}

export async function deviceId(): Promise<string> {
  let id = await getKv("device");
  if (!id) {
    id = `MOB-${Crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    await setKv("device", id);
  }
  return id;
}

export { enqueue };

/** Pushes queued operations; outcomes come from the server, which re-validates every command. */
export async function sync(): Promise<{ accepted: number; problems: number }> {
  const pending = (await ops()).filter((o) => o.state === "QUEUED" || o.state === "SYNCING");
  if (!pending.length) return { accepted: 0, problems: 0 };
  for (const o of pending) await setOp(o.id, "SYNCING", null);
  try {
    const r = await api<{ results: { clientOperationId: string; outcome: string; message: string }[] }>("/mobile/sync/operations", {
      body: { deviceId: await deviceId(), operations: pending.map((o) => ({ clientOperationId: o.id, type: o.type, baseVersion: o.base_version, payload: JSON.parse(o.payload) })) },
    });
    for (const x of r.results) await setOp(x.clientOperationId, x.outcome as never, x.message);
    return { accepted: r.results.filter((x) => x.outcome === "ACCEPTED").length, problems: r.results.filter((x) => x.outcome !== "ACCEPTED").length };
  } catch (e) {
    for (const o of pending) await setOp(o.id, "QUEUED", null);
    throw e;
  }
}
