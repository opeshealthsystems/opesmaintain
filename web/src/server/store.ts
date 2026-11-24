import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";
import type { EntityRecord, Principal, TenantRecord } from "./types";
import { ApiError, RESOURCES } from "./types";

export interface StoredFile {
  data: Uint8Array;
  contentType: string;
  fileName: string;
}

export interface SyncReceipt {
  id: string;
  tenantId: string;
  clientOperationId: string;
  deviceId: string | null;
  actor: string;
  operationType: string;
  outcome: string;
  message: string;
  resultId: string | null;
  receivedAt: string;
}

export interface MemoryStore {
  seeded: boolean;
  tenants: Map<string, TenantRecord>;
  tables: Map<string, Map<string, EntityRecord>>;
  files: Map<string, StoredFile>;
  numberSequences: Map<string, number>;
  idempotency: Map<string, { resultId: string; createdAt: string }>;
  syncOperations: Map<string, SyncReceipt[]>;
}

const globalForStore = globalThis as unknown as {
  __opesMaintainStore?: MemoryStore;
  __opesPrincipalAls?: AsyncLocalStorage<Principal | null>;
};

export function getStore(): MemoryStore {
  if (!globalForStore.__opesMaintainStore) {
    const tables = new Map<string, Map<string, EntityRecord>>();
    for (const r of RESOURCES) {
      tables.set(r.path, new Map<string, EntityRecord>());
    }
    globalForStore.__opesMaintainStore = {
      seeded: false,
      tenants: new Map<string, TenantRecord>(),
      tables,
      files: new Map<string, StoredFile>(),
      numberSequences: new Map<string, number>(),
      idempotency: new Map<string, { resultId: string; createdAt: string }>(),
      syncOperations: new Map<string, SyncReceipt[]>(),
    };
  }
  return globalForStore.__opesMaintainStore;
}

function getAls(): AsyncLocalStorage<Principal | null> {
  if (!globalForStore.__opesPrincipalAls) {
    globalForStore.__opesPrincipalAls = new AsyncLocalStorage<Principal | null>();
  }
  return globalForStore.__opesPrincipalAls;
}

export function runWithPrincipal<T>(p: Principal | null, fn: () => T): T {
  return getAls().run(p, fn);
}

export function getPrincipal(): Principal | null {
  return getAls().getStore() ?? null;
}

export function requirePrincipal(): Principal {
  const p = getPrincipal();
  if (!p) throw ApiError.unauthorized();
  return p;
}

export function requireTenantId(): string {
  return requirePrincipal().tenantId;
}

export function actorName(): string {
  return getPrincipal()?.name ?? "system";
}

export function tableOf(path: string): Map<string, EntityRecord> {
  const store = getStore();
  let t = store.tables.get(path);
  if (!t) {
    t = new Map<string, EntityRecord>();
    store.tables.set(path, t);
  }
  return t;
}

export function listByTenant(path: string, tenantId: string): EntityRecord[] {
  const out: EntityRecord[] = [];
  for (const row of tableOf(path).values()) {
    if (row.tenantId === tenantId) out.push(row);
  }
  return out;
}

export function newUuid(): string {
  return crypto.randomUUID();
}

export function nextSequenceNumber(tenantId: string, prefix: string): string {
  const store = getStore();
  const key = `${tenantId}:${prefix}`;
  const seq = (store.numberSequences.get(key) ?? 0) + 1;
  store.numberSequences.set(key, seq);
  const year = new Date().getUTCFullYear();
  return `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function nz(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function hoursBetweenIso(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.round((Math.max(0, ms) / 3600000) * 100) / 100;
}

export function addMinutesIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60000).toISOString();
}

export function addDaysIso(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 86400000).toISOString();
}

export function isoDateOnly(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function addDaysDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMonthsDate(dateStr: string, months: number): string {
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00.000Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

export function isUuid(s: string | null | undefined): boolean {
  if (!s) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
