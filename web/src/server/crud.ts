import {
  canRead,
  canWrite,
  publishOutbox,
  recordAudit,
} from "./security";
import {
  actorName,
  getPrincipal,
  getStore,
  listByTenant,
  newUuid,
  nextSequenceNumber,
  nowIso,
  requirePrincipal,
  requireTenantId,
  tableOf,
} from "./store";
import {
  ApiError,
  getField,
  getResourceDef,
  hasField,
  type EntityRecord,
  type FieldDef,
  type Principal,
  type ResourceDef,
  type ValidationError,
} from "./types";

export interface ResourceHook {
  path: string;
  beforeCreate?: (entity: EntityRecord) => void;
  beforeUpdate?: (entity: EntityRecord, before: Record<string, unknown>) => void;
  afterSave?: (entity: EntityRecord, created: boolean) => void;
  enrich?: (entities: EntityRecord[]) => void;
}

const hooksByPath = new Map<string, ResourceHook[]>();

export function registerHook(hook: ResourceHook): void {
  const list = hooksByPath.get(hook.path) ?? [];
  list.push(hook);
  hooksByPath.set(hook.path, list);
}

export function clearHooks(): void {
  hooksByPath.clear();
}

function getHooks(path: string): ResourceHook[] {
  return hooksByPath.get(path) ?? [];
}

// ------------------------------------------------------------------ Value Conversion & Formatting

function convertFieldValue(f: FieldDef, raw: unknown): unknown {
  if (raw === undefined || raw === null || raw === "") return null;
  switch (f.type) {
    case "bool":
      if (typeof raw === "boolean") return raw;
      return String(raw).toLowerCase() === "true";
    case "int": {
      const n = Number.parseInt(String(raw), 10);
      if (Number.isNaN(n)) throw ApiError.invalid(`${f.label} must be a whole number`, [{ field: f.name, message: `${f.label} must be a whole number` }]);
      return n;
    }
    case "dec":
    case "money": {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw ApiError.invalid(`${f.label} must be a number`, [{ field: f.name, message: `${f.label} must be a number` }]);
      return n;
    }
    case "date": {
      const s = String(raw).trim();
      return s.length >= 10 ? s.slice(0, 10) : s;
    }
    case "datetime": {
      const s = String(raw).trim();
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) {
        throw ApiError.invalid(`${f.label} must be a valid date/time`, [{ field: f.name, message: `${f.label} must be a valid date/time` }]);
      }
      return d.toISOString();
    }
    case "ref":
    case "str":
    case "text":
    case "enum":
    default:
      return String(raw);
  }
}

export function labelOf(def: ResourceDef, e: EntityRecord): string {
  const v = hasField(def, def.display) ? e[def.display] : null;
  const base = v === null || v === undefined ? "" : String(v);
  if (hasField(def, "number") && def.display !== "number" && e.number) {
    return `${e.number} · ${base}`;
  }
  if (hasField(def, "tag") && e.tag) {
    return `${e.tag} · ${base}`;
  }
  return base || String(e.id).slice(0, 8);
}

export function enrichEntities(def: ResourceDef, items: EntityRecord[]): void {
  for (const h of getHooks(def.path)) {
    h.enrich?.(items);
  }
}

export function toMaps(def: ResourceDef, items: EntityRecord[]): Record<string, unknown>[] {
  const labels = new Map<string, Map<string, string>>();

  for (const f of def.fields) {
    if (!f.ref) continue;
    const targetDef = getResourceDef(f.ref);
    const targetTable = tableOf(f.ref);
    let m = labels.get(f.ref);
    if (!m) {
      m = new Map<string, string>();
      labels.set(f.ref, m);
    }
    for (const e of items) {
      const refId = e[f.name];
      if (refId && !m.has(refId)) {
        const refRow = targetTable.get(refId);
        if (refRow) m.set(refId, labelOf(targetDef, refRow));
      }
    }
  }

  return items.map((e) => {
    const out: Record<string, unknown> = {
      id: e.id,
      version: e.version ?? 0,
      createdAt: e.createdAt ?? null,
      updatedAt: e.updatedAt ?? null,
      createdBy: e.createdBy ?? null,
      _label: labelOf(def, e),
    };
    for (const f of def.fields) {
      const v = e[f.name] ?? null;
      out[f.name] = v;
      if (f.ref && v) {
        out[`${f.name}Label`] = labels.get(f.ref)?.get(String(v)) ?? "—";
      }
    }
    return out;
  });
}

// ------------------------------------------------------------------ Scope & Filtering

function matchesScope(def: ResourceDef, e: EntityRecord, p: Principal): boolean {
  if (e.tenantId !== p.tenantId) return false;
  if (p.role === "CUSTOMER" && hasField(def, "customerId") && e.customerId !== p.customerId) {
    return false;
  }
  const scope = p.scope;
  if (!scope) return true;
  if (def.path === "assets") return scope.assets.has(e.id);
  if (def.path === "sites") return scope.sites.has(e.id);

  let hasScopedField = false;
  if (hasField(def, "siteId")) {
    hasScopedField = true;
    if (e.siteId && scope.sites.has(e.siteId)) return true;
  }
  if (hasField(def, "assetId")) {
    hasScopedField = true;
    if (e.assetId && scope.assets.has(e.assetId)) return true;
  }
  if (hasField(def, "workOrderId")) {
    hasScopedField = true;
    if (e.workOrderId) {
      const wo = tableOf("work-orders").get(e.workOrderId);
      if (wo && ((wo.siteId && scope.sites.has(wo.siteId)) || (wo.assetId && scope.assets.has(wo.assetId)))) {
        return true;
      }
    }
  }
  if (hasField(def, "meterId")) {
    hasScopedField = true;
    if (e.meterId) {
      const meter = tableOf("meters").get(e.meterId);
      if (meter && meter.assetId && scope.assets.has(meter.assetId)) return true;
    }
  }
  return !hasScopedField;
}

function matchesParams(def: ResourceDef, e: EntityRecord, params: Record<string, string>): boolean {
  const q = params.q?.trim().toLowerCase();
  if (q) {
    let matched = false;
    for (const f of def.fields) {
      if ((f.type === "str" || f.type === "enum") && !f.computed) {
        const val = e[f.name];
        if (val !== null && val !== undefined && String(val).toLowerCase().includes(q)) {
          matched = true;
          break;
        }
      }
    }
    if (!matched) return false;
  }

  for (const [key, rawVal] of Object.entries(params)) {
    if (!rawVal || !rawVal.trim() || key === "q" || key === "page" || key === "size" || key === "sort") continue;
    const val = rawVal.trim();
    const f = getField(def, key);
    if (f && !f.computed) {
      if (val.includes(",") && f.type !== "text") {
        const allowed = val.split(",").map((part) => convertFieldValue(f, part));
        if (!allowed.includes(e[f.name] ?? null)) return false;
      } else if (val === "null") {
        if (e[f.name] !== null && e[f.name] !== undefined) return false;
      } else {
        const converted = convertFieldValue(f, val);
        if ((e[f.name] ?? null) !== converted) return false;
      }
    } else if (key.endsWith("From") || key.endsWith("To")) {
      const base = key.replace(/(From|To)$/, "");
      const rf = getField(def, base);
      if (rf && (rf.type === "date" || rf.type === "datetime")) {
        const bound = String(convertFieldValue(rf, val));
        const cur = e[base] ? String(e[base]) : null;
        if (!cur) return false;
        if (key.endsWith("From") && cur < bound) return false;
        if (key.endsWith("To") && cur > bound) return false;
      }
    }
  }
  return true;
}

function sortRows(def: ResourceDef, rows: EntityRecord[], sortParam?: string): EntityRecord[] {
  let field = "createdAt";
  let dir: "asc" | "desc" = "desc";
  if (sortParam && sortParam.trim()) {
    const parts = sortParam.split(",");
    const cand = parts[0].trim();
    const rf = getField(def, cand);
    if ((rf && !rf.computed) || cand === "createdAt" || cand === "updatedAt") {
      field = cand;
      dir = parts[1]?.trim().toLowerCase() === "desc" ? "desc" : "asc";
    }
  }
  return [...rows].sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    if (av === bv) return 0;
    if (av === null || av === undefined) return dir === "asc" ? -1 : 1;
    if (bv === null || bv === undefined) return dir === "asc" ? 1 : -1;
    if (typeof av === "number" && typeof bv === "number") {
      return dir === "asc" ? av - bv : bv - av;
    }
    const sa = String(av);
    const sb = String(bv);
    return dir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
  });
}

// ------------------------------------------------------------------ Reads

export function listResources(path: string, params: Record<string, string> = {}): {
  items: Record<string, unknown>[];
  total: number;
  page: number;
  size: number;
} {
  const def = getResourceDef(path);
  const p = canRead(def);
  const page = Math.max(0, Number.parseInt(params.page ?? "0", 10) || 0);
  const size = Math.min(5000, Math.max(1, Number.parseInt(params.size ?? "25", 10) || 25));

  const filtered = listByTenant(path, p.tenantId).filter(
    (row) => matchesScope(def, row, p) && matchesParams(def, row, params),
  );
  const sorted = sortRows(def, filtered, params.sort);
  const paged = sorted.slice(page * size, page * size + size);
  enrichEntities(def, paged);
  return {
    items: toMaps(def, paged),
    total: sorted.length,
    page,
    size,
  };
}

export function findAllEntities(path: string, params: Record<string, string> = {}, max = 5000): EntityRecord[] {
  const def = getResourceDef(path);
  const p = canRead(def);
  const filtered = listByTenant(path, p.tenantId).filter(
    (row) => matchesScope(def, row, p) && matchesParams(def, row, params),
  );
  const sorted = sortRows(def, filtered, params.sort).slice(0, max);
  enrichEntities(def, sorted);
  return sorted;
}

export function getResource(path: string, id: string): Record<string, unknown> {
  const def = getResourceDef(path);
  const entity = loadEntity(path, id);
  enrichEntities(def, [entity]);
  return toMaps(def, [entity])[0];
}

export function optionsResources(
  path: string,
  q?: string | null,
  filterField?: string | null,
  filterValue?: string | null,
): { id: string; label: string }[] {
  const def = getResourceDef(path);
  const p = canRead(def);
  const params: Record<string, string> = {};
  if (q) params.q = q;
  if (filterField && filterValue) params[filterField] = filterValue;
  const filtered = listByTenant(path, p.tenantId).filter(
    (row) => matchesScope(def, row, p) && matchesParams(def, row, params),
  );
  const sorted = sortRows(def, filtered, `${def.display},asc`).slice(0, 50);
  return sorted.map((e) => ({ id: e.id, label: labelOf(def, e) }));
}

export function exportCsv(path: string, params: Record<string, string> = {}): string {
  const def = getResourceDef(path);
  const { items } = listResources(path, { ...params, size: "5000", page: "0" });
  const cols = def.fields;
  const escapeCsv = (raw: string) => {
    const safe = raw.length > 0 && "=+-@".includes(raw[0]) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const lines: string[] = [];
  lines.push(cols.map((f) => escapeCsv(f.label)).join(","));
  for (const row of items) {
    lines.push(
      cols
        .map((f) => {
          const val = f.ref ? row[`${f.name}Label`] : row[f.name];
          return escapeCsv(val === null || val === undefined ? "" : String(val));
        })
        .join(","),
    );
  }
  return lines.join("\r\n");
}

export function loadEntity(path: string, id: string): EntityRecord {
  if (!id) throw ApiError.invalid("Identifier required");
  const def = getResourceDef(path);
  const p = canRead(def);
  const e = tableOf(path).get(id);
  if (!e || e.tenantId !== p.tenantId) throw ApiError.notFound(def.singular);
  if (!matchesScope(def, e, p)) throw ApiError.notFound(def.singular);
  return e;
}

// ------------------------------------------------------------------ Writes & Validation

export function checkVersion(e: EntityRecord, ifMatch?: string | null, body?: Record<string, unknown> | null): void {
  const rawIfMatch = ifMatch ? ifMatch.replace(/"/g, "").replace(/^W\//, "").trim() : null;
  const expected = rawIfMatch || (body && body.version !== undefined && body.version !== null ? String(body.version).trim() : null);
  if (!expected) {
    throw new ApiError(428, "PRECONDITION_REQUIRED", "If-Match header with the current version is required");
  }
  const current = e.version ?? 0;
  if (String(current) !== expected) {
    throw new ApiError(
      412,
      "VERSION_MISMATCH",
      `This record was changed by someone else (current version ${current}). Reload and retry.`,
    );
  }
}

function validateEntity(def: ResourceDef, e: EntityRecord): void {
  const errors: ValidationError[] = [];
  const tenantId = e.tenantId || requireTenantId();
  const cp = getPrincipal();

  for (const f of def.fields) {
    if (f.computed) continue;
    const v = e[f.name];
    if (f.required && (v === null || v === undefined || (typeof v === "string" && v.trim() === ""))) {
      errors.push({ field: f.name, message: `${f.label} is required` });
    }
    if (v !== null && v !== undefined && f.type === "enum" && !f.options.includes(String(v))) {
      errors.push({ field: f.name, message: `${f.label} has an invalid value` });
    }
    if (v !== null && v !== undefined && f.ref) {
      const targetDef = getResourceDef(f.ref);
      const refRow = tableOf(f.ref).get(String(v));
      if (!refRow || refRow.tenantId !== tenantId) {
        errors.push({ field: f.name, message: `${f.label} does not exist` });
      } else if (cp) {
        if (cp.role === "CUSTOMER" && hasField(targetDef, "customerId") && refRow.customerId !== cp.customerId) {
          errors.push({ field: f.name, message: `${f.label} does not exist` });
        } else if (cp.scope && !matchesScope(targetDef, refRow, cp)) {
          errors.push({ field: f.name, message: `${f.label} is outside your service grant` });
        }
      }
    }
  }
  if (errors.length > 0) {
    throw new ApiError(400, "VALIDATION_FAILED", errors[0].message, errors);
  }
}

function applyBody(def: ResourceDef, e: EntityRecord, body: Record<string, unknown>, creating: boolean): void {
  if (!body) return;
  for (const f of def.fields) {
    if (!(f.name in body)) continue;
    if (f.managed || f.computed) continue;
    if (f.guarded && !creating) continue;
    e[f.name] = convertFieldValue(f, body[f.name]);
  }
}

function snapshot(def: ResourceDef, e: EntityRecord): Record<string, unknown> {
  const m: Record<string, unknown> = {};
  for (const f of def.fields) {
    if (!f.computed) m[f.name] = e[f.name] ?? null;
  }
  return m;
}

function diffSnapshots(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(b)) {
    if (a[k] !== b[k]) {
      out[k] = { from: String(a[k]), to: String(b[k]) };
    }
  }
  return out;
}

export function createResource(
  path: string,
  body: Record<string, unknown>,
  idemKey?: string | null,
): Record<string, unknown> {
  const def = getResourceDef(path);
  const p = canWrite(def);
  const store = getStore();
  if (idemKey && idemKey.trim()) {
    const k = `${p.tenantId}:create:${path}:${idemKey.trim()}`;
    const prior = store.idempotency.get(k);
    if (prior) return getResource(path, prior.resultId);
  }

  const e: EntityRecord = {
    id: newUuid(),
    tenantId: p.tenantId,
    version: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdBy: p.name,
  };
  applyBody(def, e, body, true);
  if (p.role === "CUSTOMER" && hasField(def, "customerId")) {
    e.customerId = p.customerId;
  }
  const saved = persistNew(path, e);

  if (idemKey && idemKey.trim()) {
    const k = `${p.tenantId}:create:${path}:${idemKey.trim()}`;
    store.idempotency.set(k, { resultId: saved.id, createdAt: nowIso() });
  }
  return getResource(path, saved.id);
}

export function persistNew(path: string, partial: Partial<EntityRecord>): EntityRecord {
  const def = getResourceDef(path);
  const p = getPrincipal();
  const tenantId = partial.tenantId || p?.tenantId || requireTenantId();
  const now = nowIso();
  const e: EntityRecord = {
    ...partial,
    id: partial.id || newUuid(),
    tenantId,
    version: partial.version ?? 0,
    createdAt: partial.createdAt || now,
    updatedAt: partial.updatedAt || now,
    createdBy: partial.createdBy || actorName(),
  };

  if (def.prefix && hasField(def, "number") && !e.number) {
    e.number = nextSequenceNumber(tenantId, def.prefix);
  }

  for (const h of getHooks(path)) h.beforeCreate?.(e);
  validateEntity(def, e);
  tableOf(path).set(e.id, e);
  for (const h of getHooks(path)) h.afterSave?.(e, true);

  recordAudit("CREATE", def.singular, e.id, { label: labelOf(def, e) });
  publishOutbox(`${def.entity}Created.v1`, def.entity, e.id, { id: e.id });
  return e;
}

export function updateResource(
  path: string,
  id: string,
  body: Record<string, unknown>,
  ifMatch?: string | null,
): Record<string, unknown> {
  const def = getResourceDef(path);
  canWrite(def);
  const e = loadEntity(path, id);
  checkVersion(e, ifMatch, body);
  const before = snapshot(def, e);

  // Copy to avoid partial mutation if hook/validation throws
  const draft: EntityRecord = { ...e };
  applyBody(def, draft, body, false);
  for (const h of getHooks(path)) h.beforeUpdate?.(draft, before);
  validateEntity(def, draft);

  draft.version = (e.version ?? 0) + 1;
  draft.updatedAt = nowIso();
  tableOf(path).set(id, draft);

  for (const h of getHooks(path)) h.afterSave?.(draft, false);
  const changes = diffSnapshots(before, snapshot(def, draft));
  recordAudit("UPDATE", def.singular, id, changes);
  publishOutbox(`${def.entity}Updated.v1`, def.entity, id, { changed: Object.keys(changes) });
  return getResource(path, id);
}

export function saveDomain(
  path: string,
  e: EntityRecord,
  action: string,
  eventType: string | null,
  detail: Record<string, unknown> = {},
): EntityRecord {
  const def = getResourceDef(path);
  validateEntity(def, e);
  e.version = (e.version ?? 0) + 1;
  e.updatedAt = nowIso();
  tableOf(path).set(e.id, e);
  for (const h of getHooks(path)) h.afterSave?.(e, false);
  recordAudit(action, def.singular, e.id, detail);
  if (eventType) publishOutbox(eventType, def.entity, e.id, detail);
  return e;
}
