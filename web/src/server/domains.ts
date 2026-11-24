import crypto from "node:crypto";
import {
  checkVersion,
  clearHooks,
  loadEntity,
  persistNew,
  registerHook,
  saveDomain,
} from "./crud";
import {
  hashPassword,
  requireRole,
  requireRoleOrDelegation,
} from "./security";
import {
  actorName,
  addDaysDate,
  addMinutesIso,
  addMonthsDate,
  getStore,
  hoursBetweenIso,
  isoDateOnly,
  listByTenant,
  newUuid,
  nowIso,
  nz,
  requirePrincipal,
  requireTenantId,
  round2,
  tableOf,
} from "./store";
import { ApiError, type EntityRecord } from "./types";

function strVal(body: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!body || body[key] === null || body[key] === undefined) return null;
  const s = String(body[key]).trim();
  return s.length === 0 ? null : s;
}

function numVal(body: Record<string, unknown> | null | undefined, key: string): number | null {
  const s = strVal(body, key);
  if (s === null) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) throw ApiError.invalid(`${key} must be a number`);
  return n;
}

function reqReason(v: string | null, message: string): string {
  if (!v) throw ApiError.guard("REASON_REQUIRED", message);
  return v;
}

// ------------------------------------------------------------------ Inventory

const STOCK_ROLES = new Set(["STOREKEEPER", "MANAGER", "TECHNICIAN", "PLANNER"]);

function requireStockRole(): void {
  const p = requirePrincipal();
  if (p.role !== "ADMIN" && !STOCK_ROLES.has(p.role)) {
    throw ApiError.forbidden(`Role ${p.role} cannot move stock`);
  }
}

export function onHandQty(partId: string, warehouseId: string): number {
  let sum = 0;
  for (const m of tableOf("stock-movements").values()) {
    if (m.partId === partId && m.warehouseId === warehouseId) {
      sum += nz(m.quantity);
    }
  }
  return round2(sum);
}

export function reservedQty(partId: string, warehouseId: string): number {
  let sum = 0;
  for (const r of tableOf("stock-reservations").values()) {
    if (r.partId === partId && r.warehouseId === warehouseId && r.status === "OPEN") {
      sum += nz(r.quantity) - nz(r.issuedQty);
    }
  }
  return round2(sum);
}

export function openReservationCount(workOrderId: string): number {
  let c = 0;
  for (const r of tableOf("stock-reservations").values()) {
    if (r.workOrderId === workOrderId && r.status === "OPEN") c++;
  }
  return c;
}

export function issuedCostForWorkOrder(workOrderId: string): number {
  let sum = 0;
  for (const m of tableOf("stock-movements").values()) {
    if (m.workOrderId === workOrderId && (m.movementType === "ISSUE" || m.movementType === "RETURN")) {
      sum += -nz(m.quantity) * nz(m.unitCost);
    }
  }
  return round2(sum);
}

function findMovementByOp(tenantId: string, opId: string | null | undefined): EntityRecord | null {
  if (!opId || !opId.trim()) return null;
  for (const m of listByTenant("stock-movements", tenantId)) {
    if (m.clientOperationId === opId) return m;
  }
  return null;
}

function recordStockMovement(
  part: EntityRecord,
  warehouseId: string,
  movementType: string,
  quantity: number,
  unitCost: number,
  workOrderId: string | null,
  reservationId: string | null,
  reference: string | null,
  clientOperationId: string | null,
  reason: string | null,
): EntityRecord {
  return persistNew("stock-movements", {
    partId: part.id,
    warehouseId,
    movementType,
    quantity: round2(quantity),
    unitCost: round2(unitCost),
    workOrderId,
    reservationId,
    reference,
    clientOperationId,
    reason,
    occurredAt: nowIso(),
    actor: actorName(),
  });
}

export function receiveStock(
  partId: string,
  warehouseId: string,
  qty: number | null,
  unitCost: number | null,
  reference: string | null,
  opId: string | null,
): EntityRecord {
  requireRole("STOREKEEPER", "MANAGER", "PROCUREMENT");
  const tenantId = requireTenantId();
  const prior = findMovementByOp(tenantId, opId);
  if (prior) return prior;
  if (qty === null || qty <= 0) throw ApiError.invalid("Quantity must be greater than zero");
  const part = loadEntity("parts", partId);
  loadEntity("warehouses", warehouseId);
  return recordStockMovement(
    part,
    warehouseId,
    "RECEIPT",
    qty,
    unitCost ?? nz(part.unitCost),
    null,
    null,
    reference,
    opId,
    null,
  );
}

export function reserveStock(
  partId: string,
  warehouseId: string,
  workOrderId: string,
  qty: number | null,
  opId: string | null,
): EntityRecord {
  requireStockRole();
  const tenantId = requireTenantId();
  if (opId) {
    const prior = listByTenant("stock-reservations", tenantId).find((r) => r.clientOperationId === opId);
    if (prior) return prior;
  }
  if (qty === null || qty <= 0) throw ApiError.invalid("Quantity must be greater than zero");
  const part = loadEntity("parts", partId);
  loadEntity("warehouses", warehouseId);
  const wo = loadEntity("work-orders", workOrderId);
  if (wo.status === "CLOSED" || wo.status === "CANCELLED") {
    throw ApiError.guard("WORK_ORDER_CLOSED", "Cannot reserve for a closed or cancelled work order");
  }
  const available = round2(onHandQty(partId, warehouseId) - reservedQty(partId, warehouseId));
  if (available < qty) {
    throw ApiError.guard("INSUFFICIENT_STOCK", `Only ${available} ${part.unit} available for ${part.partNo}`);
  }
  return persistNew("stock-reservations", {
    partId,
    warehouseId,
    workOrderId,
    quantity: round2(qty),
    issuedQty: 0,
    status: "OPEN",
    clientOperationId: opId,
  });
}

export function issueReservation(
  reservationId: string,
  qty: number | null,
  opId: string | null,
): EntityRecord {
  requireStockRole();
  const tenantId = requireTenantId();
  const prior = findMovementByOp(tenantId, opId);
  if (prior) return prior;
  const r = loadEntity("stock-reservations", reservationId);
  const part = loadEntity("parts", r.partId);
  if (r.status !== "OPEN") {
    throw ApiError.guard("RESERVATION_CLOSED", `Reservation is ${r.status}`);
  }
  const remaining = round2(nz(r.quantity) - nz(r.issuedQty));
  const q = qty === null ? remaining : qty;
  if (q <= 0) throw ApiError.invalid("Quantity must be greater than zero");
  if (q > remaining) {
    throw ApiError.guard("OVER_ISSUE", `Cannot issue more than the reserved remainder ${remaining}`);
  }
  if (onHandQty(r.partId, r.warehouseId) < q) {
    throw ApiError.guard("INSUFFICIENT_STOCK", "Insufficient physical stock");
  }
  r.issuedQty = round2(nz(r.issuedQty) + q);
  if (r.issuedQty >= nz(r.quantity)) r.status = "ISSUED";
  saveDomain("stock-reservations", r, "ISSUE", "PartIssued.v1", { qty: String(q) });
  return recordStockMovement(
    part,
    r.warehouseId,
    "ISSUE",
    -q,
    nz(part.unitCost),
    r.workOrderId,
    r.id,
    "Issue to work order",
    opId,
    null,
  );
}

export function releaseReservation(reservationId: string): EntityRecord {
  requireStockRole();
  const r = loadEntity("stock-reservations", reservationId);
  if (r.status !== "OPEN") throw ApiError.guard("RESERVATION_CLOSED", `Reservation is ${r.status}`);
  r.status = "RELEASED";
  return saveDomain("stock-reservations", r, "RELEASE", "PartReservationReleased.v1", {});
}

export function releaseAllForWorkOrder(workOrderId: string): void {
  for (const r of tableOf("stock-reservations").values()) {
    if (r.workOrderId === workOrderId && r.status === "OPEN") {
      r.status = "RELEASED";
      saveDomain("stock-reservations", r, "RELEASE", "PartReservationReleased.v1", {
        reason: "work order cancelled",
      });
    }
  }
}

export function returnStock(
  partId: string,
  warehouseId: string,
  workOrderId: string | null,
  qty: number | null,
  reason: string | null,
  opId: string | null,
): EntityRecord {
  requireStockRole();
  const tenantId = requireTenantId();
  const prior = findMovementByOp(tenantId, opId);
  if (prior) return prior;
  if (qty === null || qty <= 0) throw ApiError.invalid("Quantity must be greater than zero");
  const part = loadEntity("parts", partId);
  loadEntity("warehouses", warehouseId);
  if (workOrderId) {
    let issued = 0;
    for (const m of tableOf("stock-movements").values()) {
      if (m.workOrderId === workOrderId && m.partId === partId && (m.movementType === "ISSUE" || m.movementType === "RETURN")) {
        issued += -nz(m.quantity);
      }
    }
    issued = round2(issued);
    if (qty > issued) {
      throw ApiError.guard("OVER_RETURN", `Cannot return more than was issued to the work order (${issued})`);
    }
  }
  return recordStockMovement(
    part,
    warehouseId,
    "RETURN",
    qty,
    nz(part.unitCost),
    workOrderId,
    null,
    "Return from work",
    opId,
    reason,
  );
}

export function adjustStock(
  partId: string,
  warehouseId: string,
  delta: number | null,
  reason: string | null,
  opId: string | null,
): EntityRecord {
  requireRole("STOREKEEPER", "MANAGER");
  const tenantId = requireTenantId();
  const prior = findMovementByOp(tenantId, opId);
  if (prior) return prior;
  if (delta === null || delta === 0) throw ApiError.invalid("Adjustment quantity must be non-zero");
  reqReason(reason, "An adjustment reason is required");
  const part = loadEntity("parts", partId);
  loadEntity("warehouses", warehouseId);
  if (onHandQty(partId, warehouseId) + delta < 0) {
    throw ApiError.guard("NEGATIVE_STOCK", "Adjustment would make stock negative");
  }
  return recordStockMovement(
    part,
    warehouseId,
    "ADJUSTMENT",
    delta,
    nz(part.unitCost),
    null,
    null,
    "Stock adjustment",
    opId,
    reason,
  );
}

export function transferStock(
  partId: string,
  fromWh: string,
  toWh: string,
  qty: number | null,
  opId: string | null,
): EntityRecord[] {
  requireRole("STOREKEEPER", "MANAGER");
  if (qty === null || qty <= 0) throw ApiError.invalid("Quantity must be greater than zero");
  if (fromWh === toWh) throw ApiError.invalid("Source and destination must differ");
  const part = loadEntity("parts", partId);
  loadEntity("warehouses", fromWh);
  loadEntity("warehouses", toWh);
  const available = round2(onHandQty(partId, fromWh) - reservedQty(partId, fromWh));
  if (available < qty) {
    throw ApiError.guard("INSUFFICIENT_STOCK", `Only ${available} available to transfer`);
  }
  const outM = recordStockMovement(
    part,
    fromWh,
    "TRANSFER_OUT",
    -qty,
    nz(part.unitCost),
    null,
    null,
    "Transfer",
    opId ? `${opId}:out` : null,
    null,
  );
  const inM = recordStockMovement(
    part,
    toWh,
    "TRANSFER_IN",
    qty,
    nz(part.unitCost),
    null,
    null,
    "Transfer",
    opId ? `${opId}:in` : null,
    null,
  );
  return [outM, inM];
}

export function postCycleCount(id: string): EntityRecord {
  requireRole("STOREKEEPER", "MANAGER");
  const c = loadEntity("cycle-counts", id);
  if (c.status === "POSTED") throw ApiError.guard("ALREADY_POSTED", "Cycle count already posted");
  const system = onHandQty(c.partId, c.warehouseId);
  c.systemQty = system;
  c.variance = round2(nz(c.countedQty) - system);
  if (c.variance !== 0) {
    const part = loadEntity("parts", c.partId);
    recordStockMovement(
      part,
      c.warehouseId,
      "ADJUSTMENT",
      c.variance,
      nz(part.unitCost),
      null,
      null,
      "Cycle count",
      `cc:${c.id}`,
      "Cycle count variance",
    );
  }
  c.status = "POSTED";
  return saveDomain("cycle-counts", c, "POST", "CycleCountPosted.v1", { variance: String(c.variance) });
}

export function stockByWarehouse(partId: string): Record<string, unknown>[] {
  const part = loadEntity("parts", partId);
  const tenantId = requireTenantId();
  const warehouses = listByTenant("warehouses", tenantId).sort((a, b) =>
    String(a.name).localeCompare(String(b.name)),
  );
  const out: Record<string, unknown>[] = [];
  for (const w of warehouses) {
    const oh = onHandQty(part.id, w.id);
    const rs = reservedQty(part.id, w.id);
    if (oh === 0 && rs === 0) continue;
    out.push(stockRow(w, part, oh, rs));
  }
  return out;
}

export function warehouseStock(warehouseId: string): Record<string, unknown>[] {
  const w = loadEntity("warehouses", warehouseId);
  const byPart = new Map<string, number>();
  for (const m of tableOf("stock-movements").values()) {
    if (m.warehouseId === w.id) {
      byPart.set(m.partId, round2((byPart.get(m.partId) ?? 0) + nz(m.quantity)));
    }
  }
  const out: Record<string, unknown>[] = [];
  for (const [partId, oh] of byPart.entries()) {
    const p = tableOf("parts").get(partId);
    if (!p) continue;
    out.push(stockRow(w, p, oh, reservedQty(p.id, w.id)));
  }
  out.sort((a, b) => String(a.partName).localeCompare(String(b.partName)));
  return out;
}

function stockRow(w: EntityRecord, p: EntityRecord, oh: number, rs: number): Record<string, unknown> {
  return {
    warehouseId: w.id,
    warehouseName: w.name,
    partId: p.id,
    partNo: p.partNo,
    partName: p.name,
    unit: p.unit,
    onHand: oh,
    reserved: rs,
    available: round2(oh - rs),
    unitCost: p.unitCost ?? 0,
    value: round2(oh * nz(p.unitCost)),
    reorderPoint: p.reorderPoint ?? 0,
  };
}

// ------------------------------------------------------------------ Assets

const ASSET_STATUSES = new Set([
  "PROPOSED",
  "ACTIVE",
  "OUT_OF_SERVICE",
  "UNDER_MAINTENANCE",
  "QUARANTINED",
  "RETIRED",
  "DISPOSED",
]);
const ASSET_SAFETY = new Set(["CLEAR", "RESTRICTED", "LOCKED_OUT", "PERMIT_REQUIRED"]);

function recordAssetEvent(
  a: EntityRecord,
  eventType: string,
  fromValue: string | null,
  toValue: string | null,
  reason: string,
): void {
  persistNew("asset-events", {
    assetId: a.id,
    eventType,
    fromValue,
    toValue,
    reason,
    effectiveAt: nowIso(),
    actor: actorName(),
  });
}

export function changeAssetStatus(id: string, status: string | null, reason: string | null): EntityRecord {
  requireRole("MANAGER", "PLANNER");
  if (!status || !ASSET_STATUSES.has(status)) throw ApiError.invalid(`Unknown asset status ${status}`);
  const r = reqReason(reason, "A reason is required");
  const a = loadEntity("assets", id);
  if (a.status === "DISPOSED") throw ApiError.guard("ASSET_DISPOSED", "Disposed assets cannot change status");
  if (status === "ACTIVE" && a.safetyState === "LOCKED_OUT") {
    throw ApiError.guard(
      "SAFETY_LOCKOUT",
      "Clear the physical lockout (safety officer) before returning the asset to service",
    );
  }
  const from = a.status;
  a.status = status;
  recordAssetEvent(a, "STATUS_CHANGED", from, status, r);
  return saveDomain("assets", a, "STATUS_CHANGE", "AssetStatusChanged.v1", { from, to: status, reason: r });
}

export function changeAssetSafety(id: string, state: string | null, reason: string | null): EntityRecord {
  requireRole("SAFETY_OFFICER", "MANAGER");
  if (!state || !ASSET_SAFETY.has(state)) throw ApiError.invalid(`Unknown safety state ${state}`);
  const r = reqReason(reason, "A reason is required");
  const a = loadEntity("assets", id);
  const from = a.safetyState;
  a.safetyState = state;
  recordAssetEvent(a, "SAFETY_CHANGED", from, state, r);
  return saveDomain("assets", a, "SAFETY_CHANGE", "AssetSafetyStateChanged.v1", {
    from: String(from),
    to: state,
    reason: r,
  });
}

export function transferAsset(
  id: string,
  siteId: string | null,
  locationId: string | null,
  reason: string | null,
): EntityRecord {
  requireRole("MANAGER");
  const r = reqReason(reason, "A reason is required");
  if (!siteId) throw ApiError.invalid("siteId is required");
  const a = loadEntity("assets", id);
  const target = loadEntity("sites", siteId);
  const from = a.siteId ? loadEntity("sites", a.siteId).name : "-";
  a.siteId = target.id;
  a.locationId = locationId;
  recordAssetEvent(a, "TRANSFERRED", from, target.name, r);
  return saveDomain("assets", a, "TRANSFER", "AssetTransferred.v1", { from, to: target.name });
}

export function retireAsset(id: string, reason: string | null, dispose: boolean): EntityRecord {
  requireRole("MANAGER");
  const r = reqReason(reason, "A reason is required");
  const a = loadEntity("assets", id);
  const from = a.status;
  a.status = dispose ? "DISPOSED" : "RETIRED";
  recordAssetEvent(a, dispose ? "DISPOSED" : "RETIRED", from, a.status, r);
  for (const t of tableOf("passport-tokens").values()) {
    if (t.assetId === a.id && t.status === "ACTIVE") {
      t.status = "REVOKED";
      t.revokedAt = nowIso();
      saveDomain("passport-tokens", t, "REVOKE", "PassportTokenRevoked.v1", { reason: "asset retired" });
    }
  }
  return saveDomain("assets", a, dispose ? "DISPOSE" : "RETIRE", "AssetRetired.v1", { reason: r });
}

export function issuePassportToken(assetId: string): EntityRecord {
  requireRole("MANAGER", "PLANNER");
  const a = loadEntity("assets", assetId);
  for (const t of tableOf("passport-tokens").values()) {
    if (t.assetId === a.id && t.status === "ACTIVE") {
      t.status = "REVOKED";
      t.revokedAt = nowIso();
      saveDomain("passport-tokens", t, "ROTATE", "PassportTokenRevoked.v1", { reason: "rotated" });
    }
  }
  const token = crypto.randomBytes(18).toString("base64url");
  return persistNew("passport-tokens", {
    assetId: a.id,
    token,
    status: "ACTIVE",
    issuedAt: nowIso(),
    scanCount: 0,
  });
}

export function revokePassportToken(tokenId: string): EntityRecord {
  requireRole("MANAGER", "PLANNER");
  const t = loadEntity("passport-tokens", tokenId);
  t.status = "REVOKED";
  t.revokedAt = nowIso();
  return saveDomain("passport-tokens", t, "REVOKE", "PassportTokenRevoked.v1", {});
}

export function publicScanPassport(token: string): Record<string, unknown> {
  let found: EntityRecord | null = null;
  for (const t of tableOf("passport-tokens").values()) {
    if (t.token === token) {
      found = t;
      break;
    }
  }
  const valid = Boolean(found && found.status === "ACTIVE");
  return {
    valid,
    message: valid ? "Sign in to view this equipment passport." : "This QR code is not valid.",
  };
}

export function resolvePassportToken(token: string): string {
  const tenantId = requireTenantId();
  let found: EntityRecord | null = null;
  for (const t of tableOf("passport-tokens").values()) {
    if (t.token === token && t.tenantId === tenantId) {
      found = t;
      break;
    }
  }
  if (!found || found.status !== "ACTIVE") throw ApiError.notFound("Passport");
  loadEntity("assets", found.assetId);
  found.scanCount = Number(found.scanCount ?? 0) + 1;
  saveDomain("passport-tokens", found, "PASSPORT_SCAN", null, { asset: found.assetId });
  return found.assetId;
}

export function assetTree(rootId: string): Record<string, unknown>[] {
  const root = loadEntity("assets", rootId);
  const tenantId = requireTenantId();
  const all = listByTenant("assets", tenantId);
  const out: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  function walk(a: EntityRecord, depth: number) {
    if (seen.has(a.id) || depth > 12) return;
    seen.add(a.id);
    out.push({ id: a.id, tag: a.tag, name: a.name, status: a.status, depth });
    for (const c of all) {
      if (c.parentId === a.id) walk(c, depth + 1);
    }
  }
  walk(root, 0);
  return out;
}

// ------------------------------------------------------------------ Preventive Maintenance

function advancePmDate(p: EntityRecord, iso: string): string {
  const d = new Date(iso);
  const n = !p.intervalValue || Number(p.intervalValue) <= 0 ? 1 : Number(p.intervalValue);
  const unit = p.intervalUnit || "MONTH";
  if (unit === "DAY") d.setUTCDate(d.getUTCDate() + n);
  else if (unit === "WEEK") d.setUTCDate(d.getUTCDate() + n * 7);
  else if (unit === "YEAR") d.setUTCFullYear(d.getUTCFullYear() + n);
  else d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString();
}

function firstPmDue(p: EntityRecord, fromIso: string): string {
  const anchor = p.anchorDate ? String(p.anchorDate).slice(0, 10) : isoDateOnly();
  let cursor = `${anchor}T08:00:00.000Z`;
  const floor = `${fromIso.slice(0, 10)}T08:00:00.000Z`;
  let guard = 0;
  while (cursor < floor && guard++ < 5000) {
    cursor = advancePmDate(p, cursor);
  }
  return cursor;
}

function generatePmWorkOrder(p: EntityRecord, key: string, dueIso: string): EntityRecord | null {
  const existing = listByTenant("pm-occurrences", p.tenantId).find(
    (o) => o.planId === p.id && o.occurrenceKey === key && o.planVersion === p.planVersion,
  );
  if (existing) return null;

  const wo = persistNew("work-orders", {
    tenantId: p.tenantId,
    title: `PM: ${p.name}`,
    description: `Generated from plan ${p.code ?? p.number} v${p.planVersion} (${key})`,
    workType: p.workType || "PREVENTIVE",
    priority: p.priority || "PLANNED",
    assetId: p.assetId,
    siteId: p.siteId,
    pmPlanId: p.id,
    estimatedHours: p.estimatedHours ?? null,
    dueAt: dueIso,
    plannedStart: dueIso,
  });

  if (p.taskList) {
    let seq = 1;
    for (const line of String(p.taskList).split(/\r?\n/)) {
      if (!line.trim()) continue;
      persistNew("work-tasks", {
        tenantId: p.tenantId,
        workOrderId: wo.id,
        sequence: seq++,
        description: line.trim(),
        required: true,
        status: "PENDING",
      });
    }
  }

  const tz = p.timeZone || "UTC";
  persistNew("pm-occurrences", {
    tenantId: p.tenantId,
    planId: p.id,
    planVersion: p.planVersion,
    occurrenceKey: key,
    dueAt: dueIso,
    localDue: `${dueIso.slice(0, 10)} 08:00 ${tz}`,
    workOrderId: wo.id,
    status: "GENERATED",
  });

  return wo;
}

export function pmCommand(id: string, action: string): EntityRecord {
  requireRole("MANAGER", "PLANNER");
  const p = loadEntity("pm-plans", id);
  const from = p.status;
  if (action === "approve") {
    if (from !== "DRAFT") throw ApiError.guard("INVALID_TRANSITION", `Plan is ${from}`);
    p.status = "APPROVED";
  } else if (action === "activate") {
    if (from !== "APPROVED" && from !== "DRAFT") throw ApiError.guard("INVALID_TRANSITION", `Plan is ${from}`);
    if (from === "DRAFT") requireRole("MANAGER");
    p.status = "ACTIVE";
    if (p.triggerType !== "METER") p.nextDueAt = firstPmDue(p, nowIso());
  } else if (action === "pause") {
    if (from !== "ACTIVE") throw ApiError.guard("INVALID_TRANSITION", `Plan is ${from}`);
    p.status = "PAUSED";
  } else if (action === "resume") {
    if (from !== "PAUSED") throw ApiError.guard("INVALID_TRANSITION", `Plan is ${from}`);
    p.status = "ACTIVE";
    if (p.triggerType !== "METER") p.nextDueAt = firstPmDue(p, nowIso());
  } else if (action === "retire") {
    if (from === "RETIRED") throw ApiError.guard("INVALID_TRANSITION", `Plan is ${from}`);
    p.status = "RETIRED";
    p.nextDueAt = null;
  } else {
    throw ApiError.notFound(`Action ${action}`);
  }
  const ev = `PmPlan${action.charAt(0).toUpperCase()}${action.slice(1)}d.v1`;
  return saveDomain("pm-plans", p, action.toUpperCase(), ev, { from, to: p.status });
}

export function pmForecast(id: string, count: number): Record<string, unknown>[] {
  const p = loadEntity("pm-plans", id);
  if (p.triggerType === "METER") return [];
  const tz = p.timeZone || "UTC";
  const out: Record<string, unknown>[] = [];
  let cursor = p.nextDueAt || firstPmDue(p, nowIso());
  for (let i = 0; i < count && cursor; i++) {
    out.push({
      dueAt: cursor,
      localDue: `${cursor.slice(0, 10)} 08:00 ${tz}`,
    });
    cursor = advancePmDate(p, cursor);
  }
  return out;
}

export function generateDuePm(tenantId: string): number {
  let created = 0;
  const now = nowIso();
  const nowMs = Date.now();
  for (const p of listByTenant("pm-plans", tenantId)) {
    if (p.status !== "ACTIVE" || p.triggerType === "METER" || !p.nextDueAt) continue;
    const leadDays = Number(p.leadDays ?? 0);
    let guard = 0;
    while (p.nextDueAt && new Date(p.nextDueAt).getTime() - leadDays * 86400000 < nowMs && guard++ < 24) {
      if (generatePmWorkOrder(p, `C:${String(p.nextDueAt).slice(0, 10)}`, p.nextDueAt)) created++;
      if (p.scheduleMode === "AFTER_COMPLETION") {
        p.nextDueAt = null;
        break;
      }
      p.nextDueAt = advancePmDate(p, p.nextDueAt);
    }
    p.lastGeneratedAt = now;
    saveDomain("pm-plans", p, "PM_SCHEDULE", null, { nextDueAt: String(p.nextDueAt) });
  }
  return created;
}

export function generatePmNow(planId: string): EntityRecord {
  requireRole("MANAGER", "PLANNER");
  const p = loadEntity("pm-plans", planId);
  if (p.status !== "ACTIVE") throw ApiError.guard("PLAN_NOT_ACTIVE", "Only active plans generate work");
  const due = p.nextDueAt || nowIso();
  const key = `C:${String(due).slice(0, 10)}`;
  const wo = generatePmWorkOrder(p, key, due);
  if (!wo) {
    const existing = listByTenant("pm-occurrences", p.tenantId).find(
      (o) => o.planId === p.id && o.occurrenceKey === key && o.planVersion === p.planVersion,
    );
    if (!existing) throw ApiError.notFound("Work Order");
    return loadEntity("work-orders", existing.workOrderId);
  }
  if (p.nextDueAt && p.scheduleMode !== "AFTER_COMPLETION") {
    p.nextDueAt = advancePmDate(p, p.nextDueAt);
    saveDomain("pm-plans", p, "PM_SCHEDULE", null, {});
  }
  return wo;
}

export function onPmMeterReading(meterId: string, value: number): void {
  for (const p of tableOf("pm-plans").values()) {
    if (p.meterId !== meterId || p.status !== "ACTIVE" || p.triggerType === "CALENDAR") continue;
    if (p.nextMeterThreshold === null || p.nextMeterThreshold === undefined || !p.meterInterval) continue;
    let threshold = Number(p.nextMeterThreshold);
    const interval = Number(p.meterInterval);
    if (value >= threshold) {
      generatePmWorkOrder(p, `M:${threshold}`, nowIso());
      while (threshold <= value) threshold += interval;
      p.nextMeterThreshold = threshold;
      saveDomain("pm-plans", p, "PM_METER_TRIGGER", "PmMeterTriggered.v1", { value: String(value) });
    }
  }
}

export function onPmWorkClosed(wo: EntityRecord): void {
  if (!wo.pmPlanId) return;
  const p = tableOf("pm-plans").get(wo.pmPlanId);
  if (!p) return;
  if (p.status === "ACTIVE" && p.scheduleMode === "AFTER_COMPLETION" && p.triggerType !== "METER") {
    const base = `${isoDateOnly()}T08:00:00.000Z`;
    p.nextDueAt = advancePmDate(p, base);
    saveDomain("pm-plans", p, "PM_REARM", null, {});
  }
}

// ------------------------------------------------------------------ Work Orders & Requests

const ACTIVE_WO_STATUSES = new Set([
  "DRAFT",
  "TRIAGED",
  "APPROVED",
  "PLANNED",
  "DISPATCHED",
  "IN_PROGRESS",
]);

const WO_RULES: Record<string, { to: string; roles: string[] }[]> = {
  DRAFT: [{ to: "TRIAGED", roles: ["DISPATCHER", "MANAGER", "PLANNER"] }],
  TRIAGED: [{ to: "APPROVED", roles: ["MANAGER"] }],
  APPROVED: [{ to: "PLANNED", roles: ["PLANNER", "MANAGER"] }],
  PLANNED: [{ to: "DISPATCHED", roles: ["DISPATCHER", "MANAGER", "PLANNER"] }],
  DISPATCHED: [{ to: "IN_PROGRESS", roles: ["TECHNICIAN", "MANAGER"] }],
  IN_PROGRESS: [{ to: "WORK_COMPLETED", roles: ["TECHNICIAN", "MANAGER"] }],
  WORK_COMPLETED: [{ to: "REVIEWED", roles: ["MANAGER", "PLANNER"] }],
  REVIEWED: [{ to: "CLOSED", roles: ["MANAGER", "PLANNER"] }],
};

const WO_DELEGABLE: Record<string, string> = {
  APPROVED: "APPROVE_WORK_ORDERS",
  REVIEWED: "REVIEW_WORK",
};

export function availableWorkOrderTransitions(id: string): string[] {
  const wo = loadEntity("work-orders", id);
  const p = requirePrincipal();
  const out: string[] = [];
  for (const r of WO_RULES[wo.status] ?? []) {
    if (p.role === "ADMIN" || r.roles.includes(p.role)) {
      out.push(r.to);
    }
  }
  if (ACTIVE_WO_STATUSES.has(wo.status) && (p.role === "ADMIN" || p.role === "MANAGER" || p.role === "SAFETY_OFFICER")) {
    out.push("ON_HOLD");
  }
  if (wo.status === "ON_HOLD" && (p.role === "ADMIN" || p.role === "MANAGER" || p.role === "SAFETY_OFFICER")) {
    out.push("RESUME");
  }
  if ((ACTIVE_WO_STATUSES.has(wo.status) || wo.status === "ON_HOLD") && wo.status !== "IN_PROGRESS" && (p.role === "ADMIN" || p.role === "MANAGER")) {
    out.push("CANCELLED");
  }
  if ((wo.status === "REVIEWED" || wo.status === "CLOSED") && (p.role === "ADMIN" || p.role === "MANAGER")) {
    out.push("REOPEN");
  }
  return out;
}

export function workOrderCosts(id: string): Record<string, unknown> {
  const wo = loadEntity("work-orders", id);
  let labor = 0;
  let hours = 0;
  for (const t of tableOf("time-entries").values()) {
    if (t.workOrderId === id) {
      labor += nz(t.cost);
      hours += nz(t.hours);
    }
  }
  const parts = issuedCostForWorkOrder(id);
  return {
    workOrder: wo.number,
    laborHours: round2(hours),
    laborCost: round2(labor),
    partsCost: round2(parts),
    totalCost: round2(labor + parts),
    estimatedHours: wo.estimatedHours ?? null,
  };
}

function woEventFor(target: string): string {
  switch (target) {
    case "TRIAGED":
      return "WorkOrderTriaged.v1";
    case "APPROVED":
      return "WorkOrderApproved.v1";
    case "PLANNED":
      return "WorkOrderPlanned.v1";
    case "DISPATCHED":
      return "WorkOrderDispatched.v1";
    case "IN_PROGRESS":
      return "WorkOrderStarted.v1";
    case "WORK_COMPLETED":
      return "WorkCompleted.v1";
    case "REVIEWED":
      return "WorkReviewed.v1";
    case "CLOSED":
      return "WorkOrderClosed.v1";
    default:
      return "WorkOrderChanged.v1";
  }
}

export function transitionWorkOrder(
  id: string,
  target: string,
  ifMatch: string | null,
  body: Record<string, unknown> | null,
): EntityRecord {
  const wo = loadEntity("work-orders", id);
  checkVersion(wo, ifMatch, body);
  const p = requirePrincipal();
  if (p.role === "CUSTOMER" || p.role === "AUDITOR") throw ApiError.forbidden("Not permitted");
  const reason = strVal(body, "reason");
  const from = wo.status;

  if (target === "ON_HOLD") {
    requireRole("MANAGER", "SAFETY_OFFICER");
    if (!ACTIVE_WO_STATUSES.has(from)) {
      throw ApiError.guard("INVALID_TRANSITION", "Only active work can be put on hold");
    }
    const r = reqReason(reason, "A hold reason is required");
    wo.previousStatus = from;
    wo.holdReason = r;
    wo.status = "ON_HOLD";
    return saveDomain("work-orders", wo, "TRANSITION", "WorkOrderHeld.v1", { from, to: wo.status, number: wo.number, reason: r });
  }
  if (target === "RESUME") {
    requireRole("MANAGER", "SAFETY_OFFICER");
    if (from !== "ON_HOLD") throw ApiError.guard("INVALID_TRANSITION", "Work order is not on hold");
    wo.status = wo.previousStatus || "PLANNED";
    wo.previousStatus = null;
    wo.holdReason = null;
    return saveDomain("work-orders", wo, "TRANSITION", "WorkOrderResumed.v1", {
      from,
      to: wo.status,
      number: wo.number,
      ...(reason ? { reason } : {}),
    });
  }
  if (target === "CANCELLED") {
    requireRole("MANAGER");
    if (!(ACTIVE_WO_STATUSES.has(from) || from === "ON_HOLD") || from === "IN_PROGRESS") {
      throw ApiError.guard("INVALID_TRANSITION", `Cannot cancel a work order in status ${from}`);
    }
    const r = reqReason(reason, "A cancellation reason is required");
    wo.cancelReason = r;
    wo.status = "CANCELLED";
    releaseAllForWorkOrder(wo.id);
    return saveDomain("work-orders", wo, "TRANSITION", "WorkOrderCancelled.v1", {
      from,
      to: wo.status,
      number: wo.number,
      reason: r,
    });
  }

  const rule = (WO_RULES[from] ?? []).find((r) => r.to === target);
  if (!rule) {
    throw ApiError.guard("INVALID_TRANSITION", `Transition ${from} → ${target} is not allowed`);
  }
  if (p.role !== "ADMIN" && !rule.roles.includes(p.role)) {
    if (WO_DELEGABLE[target]) {
      requireRoleOrDelegation(WO_DELEGABLE[target], ...rule.roles);
    } else {
      throw ApiError.forbidden(`Role ${p.role} cannot move a work order to ${target}`);
    }
  }

  const tasks = Array.from(tableOf("work-tasks").values()).filter((t) => t.workOrderId === wo.id);

  if (target === "TRIAGED") {
    if (!wo.priority || !wo.workType) {
      throw ApiError.guard("TRIAGE_INCOMPLETE", "Priority and work type are required");
    }
  } else if (target === "PLANNED") {
    if (wo.estimatedHours === null || wo.estimatedHours === undefined) {
      throw ApiError.guard("PLAN_INCOMPLETE", "Estimated hours are required to plan");
    }
    if (tasks.length === 0) {
      throw ApiError.guard("PLAN_INCOMPLETE", "At least one task is required to plan");
    }
  } else if (target === "DISPATCHED") {
    if (!wo.assigneeId) throw ApiError.guard("NO_ASSIGNEE", "Assign a technician before dispatch");
    if (wo.assetId) {
      const a = loadEntity("assets", wo.assetId);
      if (a.safetyState === "LOCKED_OUT" && !wo.permitRequired) {
        throw ApiError.guard("SAFETY_BLOCK", "Asset is locked out; a permit-controlled work order is required");
      }
    }
  } else if (target === "IN_PROGRESS") {
    if (wo.permitRequired) {
      if (!wo.permitId) throw ApiError.guard("PERMIT_REQUIRED", "An active work permit must be linked before starting");
      const permit = loadEntity("work-permits", wo.permitId);
      const nowMs = Date.now();
      if (
        permit.status !== "ACTIVE" ||
        !permit.validTo ||
        new Date(permit.validTo).getTime() < nowMs ||
        (permit.validFrom && new Date(permit.validFrom).getTime() > nowMs)
      ) {
        throw ApiError.guard(
          "PERMIT_NOT_ACTIVE",
          `Linked permit ${permit.number} is not active and valid now (online revalidation)`,
        );
      }
    }
    if (!wo.actualStart) wo.actualStart = nowIso();
  } else if (target === "WORK_COMPLETED") {
    const openRequired = tasks.filter((t) => t.required && t.status === "PENDING").length;
    if (openRequired > 0) {
      throw ApiError.guard("TASKS_OPEN", `${openRequired} required task(s) still pending`);
    }
    wo.actualEnd = nowIso();
    wo.completedBy = p.name;
    const notes = strVal(body, "completionNotes");
    if (notes !== null) wo.completionNotes = notes;
  } else if (target === "REVIEWED") {
    if (wo.completedBy && wo.completedBy === p.name) {
      throw ApiError.guard("SEPARATION_OF_DUTIES", "The person who performed the work cannot review it");
    }
    wo.reviewedBy = p.name;
  } else if (target === "CLOSED") {
    if (openReservationCount(wo.id) > 0) {
      throw ApiError.guard("STOCK_UNRECONCILED", "Issue or release all open part reservations before closing");
    }
    const unapproved = Array.from(tableOf("time-entries").values()).filter(
      (t) => t.workOrderId === wo.id && !t.approved,
    ).length;
    if (unapproved > 0) {
      throw ApiError.guard("TIME_UNAPPROVED", `${unapproved} time entr(ies) await approval`);
    }
    const code = reqReason(strVal(body, "closeoutCode"), "A closeout code is required");
    wo.closeoutCode = code;
    const c = workOrderCosts(wo.id);
    wo.laborCost = c.laborCost;
    wo.partsCost = c.partsCost;
    if (wo.slaDueAt && wo.actualEnd) {
      wo.slaBreached = new Date(wo.actualEnd).getTime() > new Date(wo.slaDueAt).getTime();
    }
    if (wo.pmPlanId) {
      for (const o of tableOf("pm-occurrences").values()) {
        if (o.workOrderId === wo.id) {
          o.status = "COMPLETED";
          o.completedAt = nowIso();
          tableOf("pm-occurrences").set(o.id, o);
        }
      }
    }
    onPmWorkClosed(wo);
  }

  wo.status = target;
  return saveDomain("work-orders", wo, "TRANSITION", woEventFor(target), {
    from,
    to: wo.status,
    number: wo.number,
    ...(reason ? { reason } : {}),
  });
}

export function reopenWorkOrder(id: string, body: Record<string, unknown> | null): EntityRecord {
  requireRole("MANAGER");
  const src = loadEntity("work-orders", id);
  if (src.status !== "REVIEWED" && src.status !== "CLOSED") {
    throw ApiError.guard("INVALID_TRANSITION", "Only reviewed or closed work can be reopened");
  }
  const reason = reqReason(strVal(body, "reason"), "A reopen reason is required");
  const saved = persistNew("work-orders", {
    title: `Follow-up: ${src.title}`,
    description: `Reopened from ${src.number}. Reason: ${reason}`,
    workType: "CORRECTIVE",
    priority: src.priority,
    assetId: src.assetId,
    siteId: src.siteId,
    locationId: src.locationId,
    customerId: src.customerId,
    contractId: src.contractId,
    parentWorkOrderId: src.id,
  });
  saveDomain("work-orders", src, "REOPEN", "WorkOrderReopened.v1", { followUp: saved.number, reason });
  return saved;
}

export function recordWorkTask(
  woId: string,
  taskId: string,
  body: Record<string, unknown> | null,
): EntityRecord {
  const wo = loadEntity("work-orders", woId);
  if (wo.status !== "IN_PROGRESS") {
    throw ApiError.guard("NOT_IN_PROGRESS", "Tasks can be recorded only while work is in progress");
  }
  const t = loadEntity("work-tasks", taskId);
  if (t.workOrderId !== woId) throw ApiError.notFound("Task");
  const status = strVal(body, "status");
  if (!status || !["DONE", "SKIPPED", "FAILED", "PENDING"].includes(status)) {
    throw ApiError.invalid("Invalid task status");
  }
  if (status === "SKIPPED" && t.required) {
    throw ApiError.guard("TASK_REQUIRED", "Required tasks cannot be skipped");
  }
  t.status = status;
  t.result = strVal(body, "result");
  t.measuredValue = strVal(body, "measuredValue");
  t.completedBy = actorName();
  t.completedAt = nowIso();
  return saveDomain("work-tasks", t, "TASK_RECORDED", "WorkTaskRecorded.v1", { status, workOrder: wo.number });
}

// Maintenance Requests

export function requestCommand(id: string, action: string, body: Record<string, unknown> | null): EntityRecord {
  requireRole("MANAGER", "DISPATCHER", "PLANNER");
  const r = loadEntity("maintenance-requests", id);

  if (action === "acknowledge") {
    if (r.status !== "SUBMITTED") throw ApiError.guard("INVALID_TRANSITION", `Request is ${r.status}`);
    r.status = "ACKNOWLEDGED";
    r.acknowledgedAt = nowIso();
    return saveDomain("maintenance-requests", r, "ACKNOWLEDGE", "MaintenanceRequestAcknowledged.v1", { number: r.number });
  }
  if (action === "triage") {
    if (!["SUBMITTED", "ACKNOWLEDGED"].includes(r.status)) {
      throw ApiError.guard("INVALID_TRANSITION", `Request is ${r.status}`);
    }
    if (!r.acknowledgedAt) r.acknowledgedAt = nowIso();
    const prio = strVal(body, "priority");
    if (prio) r.priority = prio;
    r.triageNote = strVal(body, "note");
    r.status = "TRIAGED";
    return saveDomain("maintenance-requests", r, "TRIAGE", "MaintenanceRequestTriaged.v1", { priority: r.priority });
  }
  if (action === "reject") {
    if (!["SUBMITTED", "ACKNOWLEDGED", "TRIAGED"].includes(r.status)) {
      throw ApiError.guard("INVALID_TRANSITION", `Request is ${r.status}`);
    }
    const reason = reqReason(strVal(body, "reason"), "A rejection reason is required");
    r.triageNote = reason;
    r.status = "REJECTED";
    return saveDomain("maintenance-requests", r, "REJECT", "MaintenanceRequestRejected.v1", { reason });
  }
  if (action === "link-duplicate") {
    const originalId = strVal(body, "originalId");
    if (!originalId) throw ApiError.invalid("originalId is required");
    const original = loadEntity("maintenance-requests", originalId);
    if (r.id === original.id) throw ApiError.invalid("A request cannot duplicate itself");
    if (!["SUBMITTED", "ACKNOWLEDGED", "TRIAGED"].includes(r.status)) {
      throw ApiError.guard("INVALID_TRANSITION", `Request is ${r.status}`);
    }
    r.duplicateOfId = original.id;
    r.workOrderId = original.workOrderId ?? null;
    r.status = "DUPLICATE_LINKED";
    return saveDomain("maintenance-requests", r, "LINK_DUPLICATE", "MaintenanceRequestDuplicateLinked.v1", {
      original: original.number,
    });
  }
  if (action === "convert") {
    if (r.workOrderId) return loadEntity("work-orders", r.workOrderId);
    if (!["ACKNOWLEDGED", "TRIAGED", "SUBMITTED"].includes(r.status)) {
      throw ApiError.guard("INVALID_TRANSITION", `Request is ${r.status}`);
    }
    const workType =
      strVal(body, "workType") ||
      (r.category === "SAFETY" || r.priority === "CRITICAL" ? "EMERGENCY" : "CORRECTIVE");
    const saved = persistNew("work-orders", {
      title: r.title,
      description: r.description,
      priority: r.priority,
      workType,
      assetId: r.assetId,
      siteId: r.siteId,
      locationId: r.locationId,
      customerId: r.customerId,
      requestId: r.id,
    });
    if (!r.acknowledgedAt) r.acknowledgedAt = nowIso();
    r.workOrderId = saved.id;
    r.status = "CONVERTED";
    saveDomain("maintenance-requests", r, "CONVERT", "MaintenanceRequestConverted.v1", { workOrder: saved.number });
    return saved;
  }
  throw ApiError.notFound(`Action ${action}`);
}

// ------------------------------------------------------------------ Safety & Permits

export function permitCommand(id: string, action: string, body: Record<string, unknown> | null): EntityRecord {
  const p = loadEntity("work-permits", id);
  const from = p.status;
  const actor = actorName();
  const reason = strVal(body, "reason");
  const now = nowIso();
  const nowMs = Date.now();

  if (action === "submit") {
    requireRole("TECHNICIAN", "PLANNER", "MANAGER", "SAFETY_OFFICER");
    if (from !== "DRAFT") throw ApiError.guard("INVALID_TRANSITION", `Permit is ${from}`);
    p.requestedBy = actor;
    p.status = "SUBMITTED";
  } else if (action === "verify") {
    requireRole("SAFETY_OFFICER", "MANAGER");
    if (from !== "SUBMITTED") throw ApiError.guard("INVALID_TRANSITION", `Permit is ${from}`);
    p.status = "VERIFIED";
  } else if (action === "issue") {
    requireRoleOrDelegation("ISSUE_PERMITS", "SAFETY_OFFICER");
    if (from !== "VERIFIED") throw ApiError.guard("INVALID_TRANSITION", `Permit is ${from}`);
    if (p.requestedBy === actor) {
      throw ApiError.guard("SEPARATION_OF_DUTIES", "The requester cannot issue their own permit");
    }
    if (new Date(p.validTo).getTime() < nowMs) {
      throw ApiError.guard("PERMIT_EXPIRED", "Validity window has already ended");
    }
    p.issuedBy = actor;
    p.status = "ISSUED";
  } else if (action === "activate") {
    requireRole("TECHNICIAN", "SAFETY_OFFICER", "MANAGER");
    if (from !== "ISSUED") throw ApiError.guard("INVALID_TRANSITION", `Permit is ${from}`);
    const accepted = strVal(body, "acceptedBy") || actor;
    if (nowMs < new Date(p.validFrom).getTime() || nowMs > new Date(p.validTo).getTime()) {
      throw ApiError.guard("OUTSIDE_VALIDITY", "Permit can be activated only within its validity window");
    }
    p.acceptedBy = accepted;
    p.status = "ACTIVE";
  } else if (action === "suspend") {
    requireRole("SAFETY_OFFICER", "MANAGER");
    if (from !== "ACTIVE") throw ApiError.guard("INVALID_TRANSITION", `Permit is ${from}`);
    p.revokeReason = reason;
    p.status = "SUSPENDED";
    holdLinkedWork(p.id, `Permit ${p.number} suspended`);
  } else if (action === "resume") {
    requireRole("SAFETY_OFFICER");
    if (from !== "SUSPENDED") throw ApiError.guard("INVALID_TRANSITION", `Permit is ${from}`);
    if (nowMs > new Date(p.validTo).getTime()) {
      throw ApiError.guard("PERMIT_EXPIRED", "Permit validity has ended; raise a new permit");
    }
    p.status = "ACTIVE";
  } else if (action === "close") {
    requireRole("SAFETY_OFFICER", "MANAGER", "TECHNICIAN");
    if (!["ISSUED", "ACTIVE", "SUSPENDED"].includes(from)) {
      throw ApiError.guard("INVALID_TRANSITION", `Permit is ${from}`);
    }
    p.status = "CLOSED";
  } else if (action === "revoke") {
    requireRole("SAFETY_OFFICER", "MANAGER");
    if (["CLOSED", "REVOKED", "EXPIRED"].includes(from)) {
      throw ApiError.guard("INVALID_TRANSITION", `Permit is ${from}`);
    }
    const r = reqReason(reason, "A revocation reason is required");
    p.revokeReason = r;
    p.status = "REVOKED";
    holdLinkedWork(p.id, `Permit ${p.number} revoked: ${r}`);
  } else {
    throw ApiError.notFound(`Action ${action}`);
  }

  const eventMap: Record<string, string> = {
    submit: "PermitSubmitted.v1",
    verify: "PermitVerified.v1",
    issue: "PermitApproved.v1",
    activate: "PermitActivated.v1",
    suspend: "PermitSuspended.v1",
    resume: "PermitResumed.v1",
    close: "PermitClosed.v1",
    revoke: "PermitRevoked.v1",
  };
  return saveDomain("work-permits", p, action.toUpperCase(), eventMap[action], { from, to: p.status, at: now });
}

function holdLinkedWork(permitId: string, reason: string): void {
  for (const wo of tableOf("work-orders").values()) {
    if (wo.permitId === permitId && (wo.status === "DISPATCHED" || wo.status === "IN_PROGRESS")) {
      wo.previousStatus = wo.status;
      wo.status = "ON_HOLD";
      wo.holdReason = reason;
      saveDomain("work-orders", wo, "TRANSITION", "WorkOrderHeld.v1", { reason });
    }
  }
}

// ------------------------------------------------------------------ Calibration

function restrictCalibratedAsset(c: EntityRecord, reason: string): void {
  const a = loadEntity("assets", c.assetId);
  const prior = a.safetyState;
  a.safetyState = "RESTRICTED";
  saveDomain("assets", a, "SAFETY_CHANGE", "AssetSafetyStateChanged.v1", { reason });
  persistNew("asset-events", {
    assetId: a.id,
    eventType: "SAFETY_CHANGED",
    fromValue: prior,
    toValue: "RESTRICTED",
    reason: `${reason} (${c.number})`,
    effectiveAt: nowIso(),
    actor: actorName(),
  });
}

export function calibrationCommand(
  id: string,
  action: string,
  body: Record<string, unknown> | null,
): EntityRecord {
  requireRole("CALIBRATION_OFFICER", "MANAGER");
  const c = loadEntity("calibration-events", id);
  const from = c.status;

  if (action === "record-as-found") {
    if (from !== "SCHEDULED") throw ApiError.guard("INVALID_TRANSITION", `Calibration is ${from}`);
    if (!body || body.inTolerance === null || body.inTolerance === undefined) {
      throw ApiError.invalid("Tolerance result (inTolerance) is required");
    }
    const inTol = Boolean(body.inTolerance === true || String(body.inTolerance) === "true");
    c.asFound = strVal(body, "asFound");
    c.asFoundInTolerance = inTol;
    c.performedOn = isoDateOnly();
    c.performedBy = actorName();
    c.status = "AS_FOUND";
    if (!inTol) {
      c.investigationRequired = true;
      restrictCalibratedAsset(c, "As-found result outside tolerance; evaluate affected past work");
    }
  } else if (action === "adjust") {
    if (from !== "AS_FOUND") throw ApiError.guard("INVALID_TRANSITION", `Calibration is ${from}`);
    c.status = "ADJUSTED";
  } else if (action === "record-as-left") {
    if (from !== "AS_FOUND" && from !== "ADJUSTED") {
      throw ApiError.guard("INVALID_TRANSITION", `Calibration is ${from}`);
    }
    if (!body || body.inTolerance === null || body.inTolerance === undefined) {
      throw ApiError.invalid("Tolerance result (inTolerance) is required");
    }
    const inTol = Boolean(body.inTolerance === true || String(body.inTolerance) === "true");
    c.asLeft = strVal(body, "asLeft");
    c.asLeftInTolerance = inTol;
    c.certificateNo = strVal(body, "certificateNo") ?? c.certificateNo;
    c.status = "AS_LEFT";
  } else if (action === "review") {
    if (from !== "AS_LEFT") throw ApiError.guard("INVALID_TRANSITION", `Calibration is ${from}`);
    c.status = "REVIEWED";
  } else if (action === "approve") {
    if (from !== "REVIEWED") throw ApiError.guard("INVALID_TRANSITION", `Calibration is ${from}`);
    if (c.performedBy === actorName()) {
      throw ApiError.guard("SEPARATION_OF_DUTIES", "The calibrating technician cannot approve their own result");
    }
    c.approvedBy = actorName();
    c.status = "APPROVED";
    c.eligibility = c.asLeftInTolerance ? "ELIGIBLE" : "RESTRICTED";
    if (c.eligibility === "RESTRICTED") {
      restrictCalibratedAsset(c, "As-left result outside tolerance");
    }
    if (c.planId) {
      const p = loadEntity("calibration-plans", c.planId);
      const base = c.performedOn || isoDateOnly();
      p.lastCalibratedOn = base;
      p.nextDueOn = addMonthsDate(base, Number(p.intervalMonths ?? 12));
      saveDomain("calibration-plans", p, "CALIBRATION_RECORDED", null, { nextDueOn: p.nextDueOn });
    }
  } else if (action === "reject") {
    if (from === "APPROVED" || from === "REJECTED") {
      throw ApiError.guard("INVALID_TRANSITION", `Calibration is ${from}`);
    }
    c.status = "REJECTED";
    c.eligibility = "RESTRICTED";
  } else {
    throw ApiError.notFound(`Action ${action}`);
  }

  return saveDomain(
    "calibration-events",
    c,
    action.toUpperCase(),
    action === "approve" ? "CalibrationApproved.v1" : "CalibrationUpdated.v1",
    { from, to: c.status },
  );
}

// ------------------------------------------------------------------ Commercial & Procurement

export function quoteCommand(id: string, action: string): EntityRecord {
  const p = requirePrincipal();
  const q = loadEntity("quotes", id);
  const from = q.status;

  if (action === "send") {
    requireRole("COMMERCIAL", "MANAGER");
    if (from !== "DRAFT") throw ApiError.guard("INVALID_TRANSITION", `Quotation is ${from}`);
    q.status = "SENT";
  } else if (action === "approve" || action === "reject") {
    if (p.role !== "CUSTOMER") {
      requireRoleOrDelegation("APPROVE_QUOTES", "COMMERCIAL", "MANAGER");
    }
    if (from !== "SENT") throw ApiError.guard("INVALID_TRANSITION", `Quotation is ${from}`);
    if (q.validUntil && String(q.validUntil) < isoDateOnly()) {
      q.status = "EXPIRED";
      saveDomain("quotes", q, "EXPIRE", "QuoteExpired.v1", {});
      throw ApiError.guard("QUOTE_EXPIRED", "Quotation validity has ended");
    }
    q.status = action === "approve" ? "APPROVED" : "REJECTED";
    q.approvedBy = p.name;
    q.approvedAt = nowIso();
  } else {
    throw ApiError.notFound(`Action ${action}`);
  }
  return saveDomain(
    "quotes",
    q,
    action.toUpperCase(),
    action === "approve" ? "QuoteApproved.v1" : "QuoteUpdated.v1",
    { from, to: q.status },
  );
}

export function generateBillingExport(id: string): EntityRecord {
  requireRole("COMMERCIAL", "MANAGER");
  const b = loadEntity("billing-exports", id);
  if (b.status !== "PENDING") throw ApiError.guard("INVALID_TRANSITION", `Export is ${b.status}`);
  const start = `${String(b.periodStart).slice(0, 10)}T00:00:00.000Z`;
  const end = `${addDaysDate(String(b.periodEnd), 1)}T00:00:00.000Z`;
  const scope = listByTenant("work-orders", b.tenantId).filter(
    (w) =>
      w.customerId === b.customerId &&
      w.status === "CLOSED" &&
      w.actualEnd &&
      w.actualEnd >= start &&
      w.actualEnd < end &&
      (!b.contractId || b.contractId === w.contractId),
  );
  let amount = 0;
  for (const w of scope) {
    amount += nz(w.laborCost) + nz(w.partsCost);
  }
  if (b.contractId) {
    const c = loadEntity("service-contracts", b.contractId);
    if (c.billingCycle !== "PER_JOB" && c.value) {
      const months = c.billingCycle === "QUARTERLY" ? 3 : c.billingCycle === "ANNUAL" ? 12 : 1;
      amount += round2((nz(c.value) / 12) * months);
    }
  }
  b.workOrderCount = scope.length;
  b.amount = round2(amount);
  b.externalRef = `OPES-${b.number}`;
  return saveDomain("billing-exports", b, "GENERATE", "BillingExportGenerated.v1", {
    count: scope.length,
    amount: String(b.amount),
  });
}

export function setBillingStatus(id: string, status: string): EntityRecord {
  requireRole("COMMERCIAL", "MANAGER");
  const b = loadEntity("billing-exports", id);
  const allowed =
    b.status === "PENDING"
      ? ["ACKNOWLEDGED", "REJECTED"]
      : b.status === "ACKNOWLEDGED"
        ? ["REVERSED"]
        : [];
  if (!allowed.includes(status)) {
    throw ApiError.guard("INVALID_TRANSITION", `Cannot move export from ${b.status} to ${status}`);
  }
  const from = b.status;
  b.status = status;
  const ev = `BillingExport${status.charAt(0)}${status.slice(1).toLowerCase()}.v1`;
  return saveDomain("billing-exports", b, "STATUS", ev, { from });
}

export function requisitionCommand(id: string, action: string): EntityRecord {
  if (action === "approve") requireRoleOrDelegation("APPROVE_PURCHASES", "PROCUREMENT", "MANAGER");
  else requireRole("PROCUREMENT", "MANAGER");
  const r = loadEntity("purchase-requisitions", id);
  const from = r.status;
  if (action === "submit") {
    if (from !== "DRAFT") throw ApiError.guard("INVALID_TRANSITION", `Document is ${from}`);
    r.status = "SUBMITTED";
  } else if (action === "approve") {
    if (from !== "SUBMITTED") throw ApiError.guard("INVALID_TRANSITION", `Document is ${from}`);
    if (actorName() === r.requestedBy) {
      throw ApiError.guard("SEPARATION_OF_DUTIES", "Requesters cannot approve their own requisition");
    }
    r.status = "APPROVED";
  } else if (action === "reject") {
    if (from !== "SUBMITTED") throw ApiError.guard("INVALID_TRANSITION", `Document is ${from}`);
    r.status = "REJECTED";
  } else {
    throw ApiError.notFound(`Action ${action}`);
  }
  return saveDomain("purchase-requisitions", r, action.toUpperCase(), "RequisitionUpdated.v1", {
    from,
    to: r.status,
  });
}

export function convertRequisitionToPo(reqId: string, vendorId: string | null): EntityRecord {
  requireRole("PROCUREMENT", "MANAGER");
  if (!vendorId) throw ApiError.invalid("vendorId is required");
  const r = loadEntity("purchase-requisitions", reqId);
  if (r.status !== "APPROVED") {
    throw ApiError.guard("NOT_APPROVED", "Only approved requisitions can be ordered");
  }
  const v = loadEntity("vendors", vendorId);
  if (!v.approved) {
    throw ApiError.guard("VENDOR_NOT_APPROVED", `${v.name} is not an approved vendor`);
  }
  const qty = nz(r.quantity);
  const unitPrice = !r.estimatedCost || qty === 0 ? 0 : round2(nz(r.estimatedCost) / qty);
  const po = persistNew("purchase-orders", {
    vendorId: v.id,
    requisitionId: r.id,
    partId: r.partId,
    quantity: qty,
    unitPrice,
    orderDate: isoDateOnly(),
  });
  r.status = "ORDERED";
  saveDomain("purchase-requisitions", r, "ORDER", "PurchaseRequested.v1", { po: po.number });
  return po;
}

export function purchaseOrderCommand(
  id: string,
  action: string,
  body: Record<string, unknown> | null,
): EntityRecord {
  const po = loadEntity("purchase-orders", id);
  const from = po.status;
  if (action === "issue") {
    requireRole("PROCUREMENT", "MANAGER");
    if (from !== "DRAFT") throw ApiError.guard("INVALID_TRANSITION", `Document is ${from}`);
    po.status = "ISSUED";
  } else if (action === "cancel") {
    requireRole("PROCUREMENT", "MANAGER");
    if (from !== "DRAFT" && from !== "ISSUED") {
      throw ApiError.guard("INVALID_TRANSITION", `Document is ${from}`);
    }
    po.status = "CANCELLED";
  } else if (action === "receive") {
    requireRole("STOREKEEPER", "PROCUREMENT", "MANAGER");
    if (from !== "ISSUED" && from !== "PARTIALLY_RECEIVED") {
      throw ApiError.guard("INVALID_TRANSITION", `Document is ${from}`);
    }
    if (!po.partId || !po.warehouseId) {
      throw ApiError.guard("RECEIPT_TARGET", "Part and receiving warehouse are required to receive");
    }
    const received = nz(po.receivedQty);
    const ordered = nz(po.quantity);
    const reqQty = numVal(body, "quantity");
    const qty = reqQty === null ? round2(ordered - received) : reqQty;
    if (qty <= 0 || round2(received + qty) > ordered) {
      throw ApiError.guard("OVER_RECEIPT", "Receipt exceeds ordered quantity");
    }
    receiveStock(po.partId, po.warehouseId, qty, nz(po.unitPrice), po.number, `po:${po.id}:${received}`);
    po.receivedQty = round2(received + qty);
    po.status = po.receivedQty >= ordered ? "RECEIVED" : "PARTIALLY_RECEIVED";
  } else {
    throw ApiError.notFound(`Action ${action}`);
  }
  const ev = `PurchaseOrder${action.charAt(0).toUpperCase()}${action.slice(1)}d.v1`;
  return saveDomain("purchase-orders", po, action.toUpperCase(), ev, { from, to: po.status });
}

// ------------------------------------------------------------------ Integration / IoT / Organization / Workforce / Documents

export function ingestSensorReading(sensorId: string, value: number | null): EntityRecord {
  requireRole("MANAGER", "TECHNICIAN", "PLANNER");
  if (value === null) throw ApiError.invalid("value is required");
  const s = loadEntity("sensors", sensorId);
  s.lastValue = value;
  s.lastSeenAt = nowIso();
  let severity: string | null = null;
  let threshold: number | null = null;
  if (s.alarmHigh !== null && s.alarmHigh !== undefined && value >= nz(s.alarmHigh)) {
    severity = "ALARM";
    threshold = nz(s.alarmHigh);
  } else if (s.alarmLow !== null && s.alarmLow !== undefined && value <= nz(s.alarmLow)) {
    severity = "ALARM";
    threshold = nz(s.alarmLow);
  } else if (s.warnHigh !== null && s.warnHigh !== undefined && value >= nz(s.warnHigh)) {
    severity = "WARNING";
    threshold = nz(s.warnHigh);
  } else if (s.warnLow !== null && s.warnLow !== undefined && value <= nz(s.warnLow)) {
    severity = "WARNING";
    threshold = nz(s.warnLow);
  }
  s.status = severity || "ONLINE";
  saveDomain("sensors", s, "SENSOR_READING", null, { value: String(value) });
  if (severity) {
    persistNew("sensor-alerts", {
      sensorId: s.id,
      assetId: s.assetId,
      severity,
      value,
      threshold,
      raisedAt: nowIso(),
      status: "OPEN",
    });
  }
  return s;
}

export function sensorAlertCommand(id: string, action: string): EntityRecord {
  requireRole("MANAGER", "TECHNICIAN", "PLANNER", "DISPATCHER");
  const a = loadEntity("sensor-alerts", id);
  if (action === "acknowledge") {
    if (a.status !== "OPEN") throw ApiError.guard("INVALID_TRANSITION", `Alert is ${a.status}`);
    a.status = "ACKNOWLEDGED";
  } else if (action === "clear") {
    if (a.status === "CONVERTED" || a.status === "CLEARED") {
      throw ApiError.guard("INVALID_TRANSITION", `Alert is ${a.status}`);
    }
    a.status = "CLEARED";
  } else if (action === "convert") {
    if (a.workOrderId) return a;
    if (a.status === "CLEARED") throw ApiError.guard("INVALID_TRANSITION", `Alert is ${a.status}`);
    const asset = loadEntity("assets", a.assetId);
    const s = loadEntity("sensors", a.sensorId);
    const wo = persistNew("work-orders", {
      title: `Condition alert: ${s.name} on ${asset.name}`,
      description: `${s.sensorType} reading ${a.value} ${s.unit ?? ""} crossed ${String(a.severity).toLowerCase()} threshold ${a.threshold}`,
      workType: "CORRECTIVE",
      priority: a.severity === "ALARM" ? "HIGH" : "MEDIUM",
      assetId: asset.id,
      siteId: asset.siteId,
    });
    a.workOrderId = wo.id;
    a.status = "CONVERTED";
  } else {
    throw ApiError.notFound(`Action ${action}`);
  }
  const ev = `SensorAlert${action.charAt(0).toUpperCase()}${action.slice(1)}ed.v1`;
  return saveDomain("sensor-alerts", a, action.toUpperCase(), ev, {});
}

export function testIntegration(id: string): EntityRecord {
  requireRole("MANAGER");
  const i = loadEntity("integrations", id);
  i.lastTestAt = nowIso();
  const ep = String(i.endpoint ?? "");
  const ok = ep.startsWith("https://") || ep.startsWith("opc.tcp://") || ep.startsWith("mqtts://");
  i.lastTestResult = ok
    ? "Configuration valid (endpoint uses a secure scheme)"
    : "Endpoint must use https, mqtts or opc.tcp";
  if (!ok) i.status = "ERROR";
  return saveDomain("integrations", i, "TEST", "IntegrationTested.v1", { ok });
}

export function requeueOutboxEvent(id: string): EntityRecord {
  requireRole("MANAGER");
  const e = loadEntity("outbox-events", id);
  if (e.status !== "DEAD_LETTER" && e.status !== "RETRY") {
    throw ApiError.guard("INVALID_TRANSITION", "Only failed events can be requeued");
  }
  e.status = "PENDING";
  e.attempts = 0;
  e.occurredAt = nowIso();
  return saveDomain("outbox-events", e, "REQUEUE", null, {});
}

export function revealWebhookSecret(id: string): Record<string, unknown> {
  requireRole("MANAGER");
  const w = loadEntity("webhook-subscriptions", id);
  if (!w.signingSecret) {
    w.signingSecret = `whsec_${crypto.randomBytes(24).toString("hex")}`;
    tableOf("webhook-subscriptions").set(w.id, w);
  }
  return {
    secret: w.signingSecret,
    signatureHeader: 'X-Opes-Signature: sha256=HMAC_SHA256(secret, X-Opes-Timestamp + "." + body)',
  };
}

export function revokeServiceGrant(id: string, reason: string | null): EntityRecord {
  requireRole("MANAGER");
  const r = reqReason(reason, "A revocation reason is required");
  const g = loadEntity("service-grants", id);
  if (g.status !== "ACTIVE") throw ApiError.guard("INVALID_TRANSITION", `Grant is ${g.status}`);
  g.status = "REVOKED";
  g.revokedReason = r;
  return saveDomain("service-grants", g, "REVOKE", "ServiceGrantRevoked.v1", { reason: r });
}

export function approveTimeEntry(id: string): EntityRecord {
  requireRole("MANAGER", "PLANNER", "DISPATCHER");
  const t = loadEntity("time-entries", id);
  const tech = loadEntity("technicians", t.technicianId);
  const p = requirePrincipal();
  if (tech.userId && tech.userId === p.userId) {
    throw ApiError.guard("SEPARATION_OF_DUTIES", "You cannot approve your own time");
  }
  if (t.approved) throw ApiError.guard("ALREADY_APPROVED", "Time entry already approved");
  t.approved = true;
  return saveDomain("time-entries", t, "APPROVE", "TimeEntryApproved.v1", { hours: String(t.hours) });
}

const ALLOWED_DOC_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export function uploadDocumentFile(
  documentId: string,
  bytes: Uint8Array,
  originalName: string,
  contentType: string,
): EntityRecord {
  const d = loadEntity("documents", documentId);
  requireRole("ADMIN", "CALIBRATION_OFFICER", "COMMERCIAL", "MANAGER", "PLANNER", "SAFETY_OFFICER", "TECHNICIAN");
  if (bytes.byteLength === 0) throw ApiError.invalid("File is empty");
  const type = contentType || "application/octet-stream";
  const key = `${requireTenantId()}/${newUuid()}`;
  const cleanName = (originalName || "file")
    .replace(/[\\/]/g, "_")
    .replace(/[^A-Za-z0-9._ -]/g, "_")
    .slice(-180);
  getStore().files.set(key, { data: bytes, contentType: type, fileName: cleanName });

  const previous = d.storageKey;
  d.storageKey = key;
  d.fileName = cleanName;
  d.contentType = type;
  d.sizeBytes = bytes.byteLength;
  d.checksumSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  d.status = ALLOWED_DOC_TYPES.has(type) ? "ACCEPTED" : "QUARANTINED";

  return saveDomain(
    "documents",
    d,
    previous ? "REPLACE_FILE" : "UPLOAD",
    "DocumentRegistered.v1",
    { checksum: d.checksumSha256, status: d.status },
  );
}

export function downloadDocumentFile(documentId: string): {
  doc: EntityRecord;
  data: Uint8Array;
} {
  const d = loadEntity("documents", documentId);
  if (!d.storageKey) throw ApiError.notFound("File");
  if (d.status !== "ACCEPTED") {
    throw ApiError.guard("FILE_NOT_AVAILABLE", `File is ${String(d.status).toLowerCase()} and cannot be downloaded`);
  }
  const p = requirePrincipal();
  if (d.confidential && !["ADMIN", "MANAGER", "AUDITOR", "SAFETY_OFFICER", "CALIBRATION_OFFICER"].includes(p.role)) {
    throw ApiError.forbidden("Confidential document");
  }
  const stored = getStore().files.get(d.storageKey);
  if (!stored) throw ApiError.notFound("File");
  return { doc: d, data: stored.data };
}

// ------------------------------------------------------------------ Hooks Registration

function checkAssetCycle(a: EntityRecord): void {
  let cursor = a.parentId;
  let depth = 0;
  const assets = tableOf("assets");
  while (cursor) {
    if (cursor === a.id) throw ApiError.guard("HIERARCHY_CYCLE", "An asset cannot be its own ancestor");
    if (++depth > 50) throw ApiError.guard("HIERARCHY_DEPTH", "Hierarchy too deep");
    cursor = assets.get(cursor)?.parentId ?? null;
  }
}

export function registerDomainHooks(): void {
  clearHooks();

  registerHook({
    path: "service-grants",
    beforeCreate: (g) => {
      if (g.providerOrgId === g.clientOrgId) throw ApiError.invalid("Provider and client must differ");
      if (String(g.validTo) < String(g.validFrom)) {
        throw ApiError.invalid("Grant end date must be on or after its start");
      }
      g.status = String(g.validTo) < isoDateOnly() ? "EXPIRED" : "ACTIVE";
    },
  });

  registerHook({
    path: "sites",
    beforeCreate: (s) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: String(s.timeZone) });
      } catch {
        throw ApiError.invalid("Time zone must be an IANA zone such as Africa/Douala");
      }
      if (!s.status) s.status = "ACTIVE";
      if (s.locationTrackingEnabled === null || s.locationTrackingEnabled === undefined) {
        s.locationTrackingEnabled = true;
      }
    },
    beforeUpdate: (s) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: String(s.timeZone) });
      } catch {
        throw ApiError.invalid("Time zone must be an IANA zone such as Africa/Douala");
      }
    },
  });

  registerHook({
    path: "locations",
    beforeCreate: (l) => {
      if (!l.status) l.status = "ACTIVE";
    },
    beforeUpdate: (l) => {
      if (l.status === "INACTIVE") {
        let live = 0;
        for (const a of tableOf("assets").values()) {
          if (a.locationId === l.id && a.status !== "RETIRED" && a.status !== "DISPOSED") live++;
        }
        if (live > 0) {
          throw ApiError.guard(
            "LOCATION_IN_USE",
            `${live} live asset(s) must be reassigned before deactivating this location`,
          );
        }
      }
    },
  });

  registerHook({
    path: "users",
    beforeCreate: (u) => {
      u.email = String(u.email).trim().toLowerCase();
      for (const existing of tableOf("users").values()) {
        if (String(existing.email).toLowerCase() === u.email) {
          throw ApiError.conflict("EMAIL_IN_USE", "A user with this email already exists");
        }
      }
      if (!u.status) u.status = "ACTIVE";
      if (u.mfaEnabled === null || u.mfaEnabled === undefined) u.mfaEnabled = u.role !== "TECHNICIAN";
      if (u.role === "CUSTOMER" && !u.customerId) {
        throw ApiError.invalid("Customer users must be linked to a customer");
      }
      if (!u.passwordHash) u.passwordHash = hashPassword(newUuid());
    },
    beforeUpdate: (u) => {
      if (u.role === "CUSTOMER" && !u.customerId) {
        throw ApiError.invalid("Customer users must be linked to a customer");
      }
    },
  });

  registerHook({
    path: "delegations",
    beforeCreate: (d) => {
      if (d.delegatorId === d.delegateId) throw ApiError.invalid("A user cannot delegate to themselves");
      if (d.validTo && d.validFrom && new Date(d.validTo).getTime() <= new Date(d.validFrom).getTime()) {
        throw ApiError.invalid("Validity end must be after start");
      }
      if (!d.status) d.status = "ACTIVE";
    },
  });

  registerHook({
    path: "assets",
    beforeCreate: (a) => {
      if (!a.status) a.status = "ACTIVE";
      if (!a.safetyState) a.safetyState = "CLEAR";
      checkAssetCycle(a);
    },
    beforeUpdate: (a) => checkAssetCycle(a),
    afterSave: (a, created) => {
      if (created) recordAssetEvent(a, "REGISTERED", null, a.status, "Asset registered");
    },
  });

  registerHook({
    path: "meter-readings",
    beforeCreate: (r) => {
      const m = loadEntity("meters", r.meterId);
      r.assetId = m.assetId;
      if (!r.source) r.source = "MANUAL";
      r.accepted = true;
      const val = nz(r.value);
      if (m.meterType === "CUMULATIVE" && m.lastReading !== null && m.lastReading !== undefined && val < nz(m.lastReading)) {
        r.accepted = false;
        r.rejectionReason = `Lower than last cumulative reading ${m.lastReading} (record a meter reset instead)`;
      } else if (m.maxValue !== null && m.maxValue !== undefined && val > nz(m.maxValue)) {
        r.accepted = false;
        r.rejectionReason = "Above configured maximum";
      } else if (m.minValue !== null && m.minValue !== undefined && val < nz(m.minValue)) {
        r.accepted = false;
        r.rejectionReason = "Below configured minimum";
      }
    },
    afterSave: (r, created) => {
      if (!created || !r.accepted) return;
      const m = loadEntity("meters", r.meterId);
      if (!m.lastReadingAt || String(r.readingAt) >= String(m.lastReadingAt)) {
        m.lastReading = r.value;
        m.lastReadingAt = r.readingAt;
        saveDomain("meters", m, "METER_UPDATED", null, { value: String(r.value) });
      }
      onPmMeterReading(m.id, nz(r.value));
    },
  });

  registerHook({
    path: "work-orders",
    beforeCreate: (wo) => {
      wo.status = "DRAFT";
      if (!wo.priority) wo.priority = "MEDIUM";
      if (!wo.workType) wo.workType = "CORRECTIVE";
      if (wo.assetId) {
        const a = loadEntity("assets", wo.assetId);
        if (!wo.siteId) wo.siteId = a.siteId;
        if (!wo.locationId) wo.locationId = a.locationId;
        if (!wo.customerId) wo.customerId = a.customerId;
        if (a.safetyState === "LOCKED_OUT" || a.safetyState === "PERMIT_REQUIRED") {
          wo.permitRequired = true;
        }
        const loc = wo.locationId ? tableOf("locations").get(wo.locationId)?.name ?? "" : "";
        const site = a.siteId ? tableOf("sites").get(a.siteId)?.name ?? "" : "";
        wo.assetSnapshot = `${a.tag} · ${a.name} · ${site}${loc ? ` / ${loc}` : ""} · status ${a.status}`;
      }
      const created = nowIso();
      let policy: EntityRecord | null = null;
      if (wo.contractId) {
        const c = loadEntity("service-contracts", wo.contractId);
        if (c.slaPolicyId) policy = loadEntity("sla-policies", c.slaPolicyId);
      }
      if (!policy) {
        policy = listByTenant("sla-policies", wo.tenantId).find((p) => p.priority === wo.priority) ?? null;
      }
      if (policy && policy.resolutionHours !== null && policy.resolutionHours !== undefined) {
        const mins = Math.round(nz(policy.resolutionHours) * 60);
        wo.slaDueAt = addMinutesIso(created, mins);
        if (!wo.dueAt) wo.dueAt = wo.slaDueAt;
      }
      wo.slaBreached = false;
    },
    beforeUpdate: (wo, before) => {
      if (wo.status === "CLOSED" || wo.status === "CANCELLED") {
        throw ApiError.guard("RECORD_LOCKED", "Closed or cancelled work orders are immutable; reopen to create a follow-up");
      }
      const p = requirePrincipal();
      if (before.permitRequired === true && !wo.permitRequired) {
        if (p.role !== "ADMIN" && p.role !== "MANAGER") {
          throw ApiError.forbidden("Only a manager can remove the permit requirement");
        }
        if (wo.assetId) {
          const a = loadEntity("assets", wo.assetId);
          if (a.safetyState === "LOCKED_OUT" || a.safetyState === "PERMIT_REQUIRED") {
            throw ApiError.guard(
              "SAFETY_BLOCK",
              `The asset is ${String(a.safetyState).toLowerCase().replace("_", " ")}; a permit stays required`,
            );
          }
        }
      }
      if ((before.permitId ?? null) !== (wo.permitId ?? null) && wo.status === "IN_PROGRESS") {
        throw ApiError.guard("PERMIT_LOCKED", "The linked permit cannot change while work is in progress");
      }
    },
  });

  registerHook({
    path: "maintenance-requests",
    beforeCreate: (r) => {
      r.status = "SUBMITTED";
      r.receivedAt = nowIso();
      const p = requirePrincipal();
      if (p.role === "CUSTOMER") r.channel = "PORTAL";
      if (!r.channel) r.channel = "WEB";
      if (!r.reportedBy) r.reportedBy = actorName();
      if (!r.siteId && r.assetId) r.siteId = loadEntity("assets", r.assetId).siteId;
    },
  });

  registerHook({
    path: "work-tasks",
    beforeCreate: (t) => {
      const wo = loadEntity("work-orders", t.workOrderId);
      if (["WORK_COMPLETED", "REVIEWED", "CLOSED", "CANCELLED"].includes(wo.status)) {
        throw ApiError.guard("RECORD_LOCKED", "Tasks cannot be added after work completion");
      }
      if (!t.status) t.status = "PENDING";
      if (t.required === null || t.required === undefined) t.required = true;
      if (t.sequence === null || t.sequence === undefined) {
        const count = Array.from(tableOf("work-tasks").values()).filter((x) => x.workOrderId === t.workOrderId).length;
        t.sequence = count + 1;
      }
    },
  });

  registerHook({
    path: "pm-plans",
    beforeCreate: (p) => {
      p.status = "DRAFT";
      p.planVersion = 1;
      const a = loadEntity("assets", p.assetId);
      p.siteId = a.siteId;
      if (!p.timeZone && a.siteId) p.timeZone = loadEntity("sites", a.siteId).timeZone;
      if (!p.scheduleMode) p.scheduleMode = "FIXED";
      if (!p.workType) p.workType = "PREVENTIVE";
      if (!p.priority) p.priority = "PLANNED";
      if (p.leadDays === null || p.leadDays === undefined) p.leadDays = 7;
      validatePmPlan(p);
      if (p.meterId && p.meterInterval) {
        const m = loadEntity("meters", p.meterId);
        p.nextMeterThreshold = nz(m.lastReading) + nz(p.meterInterval);
      }
    },
    beforeUpdate: (p) => {
      validatePmPlan(p);
      if (p.status === "ACTIVE" || p.status === "PAUSED") {
        p.planVersion = Number(p.planVersion ?? 1) + 1;
      }
      if (p.status === "RETIRED") {
        throw ApiError.guard("RECORD_LOCKED", "Retired plans cannot be edited");
      }
    },
  });

  registerHook({
    path: "parts",
    enrich: (entities) => {
      if (entities.length === 0) return;
      const ids = new Set(entities.map((e) => e.id));
      const quarantineWh = new Set<string>();
      for (const w of tableOf("warehouses").values()) {
        if (w.kind === "QUARANTINE") quarantineWh.add(w.id);
      }
      const onHand = new Map<string, number>();
      for (const m of tableOf("stock-movements").values()) {
        if (ids.has(m.partId) && !quarantineWh.has(m.warehouseId)) {
          onHand.set(m.partId, (onHand.get(m.partId) ?? 0) + nz(m.quantity));
        }
      }
      const reserved = new Map<string, number>();
      for (const r of tableOf("stock-reservations").values()) {
        if (ids.has(r.partId) && r.status === "OPEN") {
          reserved.set(r.partId, (reserved.get(r.partId) ?? 0) + (nz(r.quantity) - nz(r.issuedQty)));
        }
      }
      for (const p of entities) {
        const oh = round2(onHand.get(p.id) ?? 0);
        const rs = round2(reserved.get(p.id) ?? 0);
        p.onHand = oh;
        p.reserved = rs;
        p.available = round2(oh - rs);
      }
    },
  });

  registerHook({
    path: "work-permits",
    beforeCreate: (p) => {
      if (new Date(p.validTo).getTime() <= new Date(p.validFrom).getTime()) {
        throw ApiError.invalid("Validity end must be after start");
      }
      p.status = "DRAFT";
      p.requestedBy = actorName();
    },
    beforeUpdate: (p) => {
      if (p.status !== "DRAFT") throw ApiError.guard("RECORD_LOCKED", "Only draft permits can be edited");
    },
  });

  registerHook({
    path: "inspection-results",
    beforeCreate: (r) => {
      const t = loadEntity("inspection-templates", r.templateId);
      if (t.status !== "PUBLISHED") {
        throw ApiError.guard("TEMPLATE_NOT_PUBLISHED", "Only published templates can be used");
      }
      if (!r.inspector) r.inspector = actorName();
      if (r.answers && (r.score === null || r.score === undefined)) {
        const lines = String(r.answers)
          .split(/\r?\n/)
          .filter((l) => l.trim().length > 0);
        const pass = lines.filter(
          (l) => l.toUpperCase().includes("PASS") || l.toUpperCase().endsWith("YES"),
        ).length;
        r.score = lines.length === 0 ? null : Math.round((100 * pass) / lines.length);
      }
    },
    afterSave: (r, created) => {
      if (!created || r.outcome !== "FAIL") return;
      const a = loadEntity("assets", r.assetId);
      const wo = persistNew("work-orders", {
        title: `Inspection failure: ${a.name}`,
        description: r.defectsFound || "Defects found during inspection",
        workType: "CORRECTIVE",
        priority: "HIGH",
        assetId: a.id,
        siteId: a.siteId,
      });
      r.followUpWorkOrderId = wo.id;
      saveDomain("inspection-results", r, "FOLLOW_UP", null, { workOrder: wo.number });
    },
  });

  registerHook({
    path: "safety-incidents",
    beforeCreate: (i) => {
      if (!i.status) i.status = "OPEN";
      if (!i.reportedBy) i.reportedBy = actorName();
    },
  });

  registerHook({
    path: "calibration-events",
    beforeCreate: (c) => {
      c.status = "SCHEDULED";
      c.investigationRequired = false;
    },
  });

  registerHook({
    path: "calibration-plans",
    beforeCreate: (p) => {
      if (!p.status) p.status = "ACTIVE";
      if (!p.nextDueOn) p.nextDueOn = addMonthsDate(isoDateOnly(), Number(p.intervalMonths ?? 12));
    },
  });

  registerHook({
    path: "downtime-events",
    beforeCreate: (d) => computeDowntime(d),
    beforeUpdate: (d) => computeDowntime(d),
  });

  registerHook({
    path: "quotes",
    beforeCreate: (q) => {
      q.status = "DRAFT";
      computeQuoteTotal(q);
    },
    beforeUpdate: (q) => {
      if (q.status !== "DRAFT") throw ApiError.guard("RECORD_LOCKED", "Only draft quotations can be edited");
      computeQuoteTotal(q);
    },
  });

  registerHook({
    path: "service-contracts",
    beforeCreate: (c) => checkContract(c),
    beforeUpdate: (c) => checkContract(c),
  });

  registerHook({
    path: "billing-exports",
    beforeCreate: (b) => {
      if (String(b.periodEnd) < String(b.periodStart)) {
        throw ApiError.invalid("Period end must be after start");
      }
      b.status = "PENDING";
      b.workOrderCount = 0;
      b.amount = 0;
      if (!b.targetSystem) b.targetSystem = "OPES_ERP";
    },
  });

  registerHook({
    path: "service-signoffs",
    beforeCreate: (s) => {
      const wo = loadEntity("work-orders", s.workOrderId);
      if (!["WORK_COMPLETED", "REVIEWED", "CLOSED"].includes(wo.status)) {
        throw ApiError.guard("WORK_NOT_COMPLETE", "Sign-off is possible only after the work is completed");
      }
      if (!s.customerId) s.customerId = wo.customerId ?? null;
      const already = Array.from(tableOf("service-signoffs").values()).some(
        (x) => x.workOrderId === wo.id && x.accepted,
      );
      if (already) throw ApiError.guard("ALREADY_SIGNED", "This work has already been signed off");
      s.signedAt = nowIso();
      if (s.accepted === null || s.accepted === undefined) s.accepted = true;
      if (s.rating !== null && s.rating !== undefined && (Number(s.rating) < 1 || Number(s.rating) > 5)) {
        throw ApiError.invalid("Rating must be between 1 and 5");
      }
    },
  });

  registerHook({
    path: "purchase-orders",
    beforeCreate: (po) => {
      po.status = "DRAFT";
      po.receivedQty = 0;
      if (!po.orderDate) po.orderDate = isoDateOnly();
      po.total = round2(nz(po.quantity) * nz(po.unitPrice));
    },
    beforeUpdate: (po) => {
      if (po.status !== "DRAFT") {
        throw ApiError.guard("RECORD_LOCKED", "Only draft purchase orders can be edited");
      }
      po.total = round2(nz(po.quantity) * nz(po.unitPrice));
    },
  });

  registerHook({
    path: "purchase-requisitions",
    beforeCreate: (r) => {
      if (!r.status) r.status = "DRAFT";
      if (!r.requestedBy) r.requestedBy = actorName();
    },
  });

  registerHook({
    path: "sensors",
    beforeCreate: (s) => {
      s.status = "OFFLINE";
    },
  });

  registerHook({
    path: "webhook-subscriptions",
    beforeCreate: (w) => {
      checkWebhookUrl(w.url);
      w.secretHint = "Revealed to managers via :reveal-secret";
      if (!w.status) w.status = "ACTIVE";
    },
    beforeUpdate: (w) => {
      checkWebhookUrl(w.url);
    },
  });

  registerHook({
    path: "time-entries",
    beforeCreate: (t) => computeTimeEntry(t, true),
    beforeUpdate: (t) => computeTimeEntry(t, false),
  });

  registerHook({
    path: "assignments",
    beforeCreate: (a) => {
      if (new Date(a.scheduledEnd).getTime() <= new Date(a.scheduledStart).getTime()) {
        throw ApiError.invalid("Scheduled end must be after start");
      }
      if (!a.status) a.status = "PLANNED";
      if (!a.role) a.role = "LEAD";
      const tech = loadEntity("technicians", a.technicianId);
      if (tech.availability === "LEAVE") {
        throw ApiError.guard("TECHNICIAN_UNAVAILABLE", `${tech.fullName} is on leave`);
      }
      const startMs = new Date(a.scheduledStart).getTime();
      const endMs = new Date(a.scheduledEnd).getTime();
      const overlap = Array.from(tableOf("assignments").values()).some(
        (x) =>
          x.technicianId === a.technicianId &&
          !["CANCELLED", "DECLINED", "COMPLETED"].includes(x.status) &&
          new Date(x.scheduledStart).getTime() < endMs &&
          startMs < new Date(x.scheduledEnd).getTime(),
      );
      if (overlap) {
        throw ApiError.guard("SCHEDULE_CONFLICT", `${tech.fullName} already has an overlapping assignment`);
      }
    },
    afterSave: (a, created) => {
      if (!created || a.role !== "LEAD") return;
      const wo = loadEntity("work-orders", a.workOrderId);
      if (wo.status === "CLOSED" || wo.status === "CANCELLED") return;
      wo.assigneeId = a.technicianId;
      if (!wo.plannedStart) wo.plannedStart = a.scheduledStart;
      if (!wo.plannedEnd) wo.plannedEnd = a.scheduledEnd;
      saveDomain("work-orders", wo, "ASSIGN", "WorkOrderAssigned.v1", { technician: a.technicianId });
    },
  });
}

function validatePmPlan(p: EntityRecord): void {
  const calendar = p.triggerType !== "METER";
  const meter = p.triggerType !== "CALENDAR";
  if (calendar && (!p.intervalValue || Number(p.intervalValue) <= 0 || !p.intervalUnit)) {
    throw ApiError.invalid("Calendar plans need a positive interval and unit");
  }
  if (meter && (!p.meterId || !p.meterInterval || nz(p.meterInterval) <= 0)) {
    throw ApiError.invalid("Meter plans need a meter and a positive meter interval");
  }
}

function computeDowntime(d: EntityRecord): void {
  if (d.endedAt && new Date(d.endedAt).getTime() <= new Date(d.startedAt).getTime()) {
    throw ApiError.invalid("Downtime end must be after start");
  }
  d.durationHours = d.endedAt ? hoursBetweenIso(d.startedAt, d.endedAt) : null;
  d.status = d.endedAt ? "CLOSED" : "OPEN";
}

function computeQuoteTotal(q: EntityRecord): void {
  const net = nz(q.laborAmount) + nz(q.partsAmount);
  const tax = round2((net * nz(q.taxRate)) / 100);
  q.total = round2(net + tax);
}

function checkContract(c: EntityRecord): void {
  if (String(c.endDate) < String(c.startDate)) {
    throw ApiError.invalid("Contract end date must be after start date");
  }
  if (!c.status) c.status = "DRAFT";
}

function checkWebhookUrl(url: unknown): void {
  const s = String(url ?? "").trim();
  if (!s.startsWith("https://") && !s.startsWith("http://")) {
    throw ApiError.invalid("Webhook URL must start with https:// or http://");
  }
}

function computeTimeEntry(t: EntityRecord, creating: boolean): void {
  if (new Date(t.endedAt).getTime() <= new Date(t.startedAt).getTime()) {
    throw ApiError.invalid("End time must be after start time");
  }
  const hours = hoursBetweenIso(t.startedAt, t.endedAt);
  if (hours > 16) throw ApiError.invalid("A single time entry cannot exceed 16 hours");
  const wo = loadEntity("work-orders", t.workOrderId);
  if (creating && (wo.status === "CLOSED" || wo.status === "CANCELLED")) {
    throw ApiError.guard("RECORD_LOCKED", "Work order is closed");
  }
  const tech = loadEntity("technicians", t.technicianId);
  if (!t.laborType) t.laborType = "REGULAR";
  if (t.approved === null || t.approved === undefined) t.approved = false;
  t.hours = hours;
  const factor = t.laborType === "OVERTIME" ? 1.5 : 1;
  t.rate = round2(nz(tech.hourlyRate) * factor);
  t.cost = round2(hours * t.rate);
}
