import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";

/**
 * Encrypted offline store (spec §10): SQLCipher database whose key lives in the platform keystore.
 * Holds the session token, cached jobs (last-known) and the operation queue.
 */
let db: SQLite.SQLiteDatabase | null = null;

export async function store(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  let key = await SecureStore.getItemAsync("opes.dbkey");
  if (!key) {
    key = Crypto.randomUUID().replace(/-/g, "") + Crypto.randomUUID().replace(/-/g, "");
    await SecureStore.setItemAsync("opes.dbkey", key, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  }
  db = await SQLite.openDatabaseAsync("opes-maintain.db");
  await db.execAsync(`PRAGMA key = '${key}';`);
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS job (id TEXT PRIMARY KEY, data TEXT NOT NULL, cached_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS op (id TEXT PRIMARY KEY, type TEXT NOT NULL, label TEXT NOT NULL, base_version INTEGER,
      payload TEXT NOT NULL, state TEXT NOT NULL, message TEXT, queued_at TEXT NOT NULL);
  `);
  return db;
}

export async function getKv(k: string): Promise<string | null> {
  const r = await (await store()).getFirstAsync<{ v: string }>("SELECT v FROM kv WHERE k = ?", k);
  return r?.v ?? null;
}

export async function setKv(k: string, v: string | null) {
  const d = await store();
  if (v === null) await d.runAsync("DELETE FROM kv WHERE k = ?", k);
  else await d.runAsync("INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)", k, v);
}

export type OpState = "QUEUED" | "SYNCING" | "ACCEPTED" | "CONFLICT" | "REJECTED" | "REQUIRES_ONLINE_REVIEW";
export interface Op { id: string; type: string; label: string; base_version: number | null; payload: string; state: OpState; message: string | null; queued_at: string }

export async function enqueue(type: string, label: string, payload: Record<string, unknown>, baseVersion?: number) {
  await (await store()).runAsync("INSERT INTO op VALUES (?, ?, ?, ?, ?, 'QUEUED', NULL, ?)", Crypto.randomUUID(), type, label, baseVersion ?? null, JSON.stringify(payload), new Date().toISOString());
}

export async function ops(): Promise<Op[]> {
  return (await store()).getAllAsync<Op>("SELECT * FROM op ORDER BY queued_at DESC");
}

export async function setOp(id: string, state: OpState, message: string | null) {
  await (await store()).runAsync("UPDATE op SET state = ?, message = ? WHERE id = ?", state, message, id);
}

export async function cacheJob(id: string, data: unknown) {
  await (await store()).runAsync("INSERT OR REPLACE INTO job VALUES (?, ?, ?)", id, JSON.stringify(data), new Date().toISOString());
}

export async function cachedJobs(): Promise<{ id: string; data: string; cached_at: string }[]> {
  return (await store()).getAllAsync("SELECT * FROM job ORDER BY cached_at DESC");
}

/** Remote wipe / logout: erases cached business data and queued operations. */
export async function wipe() {
  await (await store()).execAsync("DELETE FROM job; DELETE FROM op; DELETE FROM kv;");
}
