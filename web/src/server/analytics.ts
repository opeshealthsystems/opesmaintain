import {
  createResource,
  findAllEntities,
  getResource,
  listResources,
  loadEntity,
  persistNew,
  registerHook,
  saveDomain,
  toMaps,
} from "./crud";
import {
  recordWorkTask,
  transitionWorkOrder,
} from "./domains";
import {
  CUSTOMER_READABLE,
  requireRole,
} from "./security";
import {
  addDaysDate,
  addDaysIso,
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
  type SyncReceipt,
} from "./store";
import {
  ApiError,
  getResourceDef,
  isInternal,
  type EntityRecord,
} from "./types";

// ------------------------------------------------------------------ KPIs

const OPEN_STATUSES = new Set([
  "DRAFT",
  "TRIAGED",
  "APPROVED",
  "PLANNED",
  "DISPATCHED",
  "IN_PROGRESS",
  "ON_HOLD",
]);

function kpiBox(numerator: number, denominator: number, formula: string): Record<string, unknown> {
  return {
    value: denominator === 0 ? null : Math.round((numerator / denominator) * 10) / 10,
    numerator: Math.round(numerator * 10) / 10,
    denominator,
    formula,
  };
}

export function getKpis(days: number, siteId?: string | null): Record<string, unknown> {
  const p = requirePrincipal();
  if (p.role === "CUSTOMER" || p.scope !== null) {
    throw ApiError.forbidden("Organization-wide analytics are not available to contractor or customer accounts");
  }
  const tenantId = p.tenantId;
  const toMs = Date.now();
  const fromMs = toMs - days * 86400000;
  const fromIso = new Date(fromMs).toISOString();
  const toIso = new Date(toMs).toISOString();

  let wos = listByTenant("work-orders", tenantId);
  if (siteId) wos = wos.filter((w) => w.siteId === siteId);

  let assets = listByTenant("assets", tenantId);
  let downs = listByTenant("downtime-events", tenantId);
  if (siteId) {
    const assetIds = new Set(assets.filter((a) => a.siteId === siteId).map((a) => a.id));
    assets = assets.filter((a) => assetIds.has(a.id));
    downs = downs.filter((d) => assetIds.has(d.assetId));
  }

  const backlog = wos.filter((w) => OPEN_STATUSES.has(w.status)).length;
  const overdue = wos.filter((w) => OPEN_STATUSES.has(w.status) && w.dueAt && new Date(w.dueAt).getTime() < toMs).length;
  const emergencyOpen = wos.filter((w) => OPEN_STATUSES.has(w.status) && w.workType === "EMERGENCY").length;

  const closed = wos.filter(
    (w) =>
      ["CLOSED", "REVIEWED", "WORK_COMPLETED"].includes(w.status) &&
      w.actualEnd &&
      new Date(w.actualEnd).getTime() > fromMs,
  );
  const repairs = closed.filter((w) => ["CORRECTIVE", "EMERGENCY"].includes(w.workType) && w.actualStart);
  const repairHours = repairs.reduce((acc, w) => acc + hoursBetweenIso(w.actualStart, w.actualEnd), 0);

  const failures = downs.filter((d) => d.downtimeType === "UNPLANNED" && new Date(d.startedAt).getTime() > fromMs);
  const periodHours = days * 24;
  let downHours = 0;
  for (const d of downs) {
    const s = Math.max(fromMs, new Date(d.startedAt).getTime());
    const e = d.endedAt ? Math.min(toMs, new Date(d.endedAt).getTime()) : toMs;
    if (e > s) downHours += (e - s) / 3600000;
  }
  downHours = round2(downHours);
  const assetHours = periodHours * Math.max(1, assets.length);

  const occs = listByTenant("pm-occurrences", tenantId).filter(
    (o) => o.dueAt && new Date(o.dueAt).getTime() > fromMs && new Date(o.dueAt).getTime() < toMs,
  );
  const onTimePm = occs.filter(
    (o) =>
      o.status === "COMPLETED" &&
      o.completedAt &&
      new Date(o.completedAt).getTime() <= new Date(o.dueAt).getTime() + 7 * 86400000,
  ).length;

  const slaScoped = closed.filter((w) => Boolean(w.slaDueAt));
  const breached = slaScoped.filter((w) => Boolean(w.slaBreached)).length;
  const slaAtRisk = wos.filter(
    (w) => OPEN_STATUSES.has(w.status) && w.slaDueAt && new Date(w.slaDueAt).getTime() < toMs + 24 * 3600000,
  ).length;

  const laborCost = round2(closed.reduce((acc, w) => acc + nz(w.laborCost), 0));
  const partsCost = round2(closed.reduce((acc, w) => acc + nz(w.partsCost), 0));
  const planned = closed.filter((w) => ["PREVENTIVE", "INSPECTION", "CALIBRATION"].includes(w.workType)).length;

  const workOrdersByStatus: Record<string, number> = {};
  const openByType: Record<string, number> = {};
  const openByPriority: Record<string, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    PLANNED: 0,
  };
  for (const w of wos) {
    workOrdersByStatus[w.status] = (workOrdersByStatus[w.status] ?? 0) + 1;
    if (OPEN_STATUSES.has(w.status)) {
      openByType[w.workType] = (openByType[w.workType] ?? 0) + 1;
      if (w.priority) openByPriority[w.priority] = (openByPriority[w.priority] ?? 0) + 1;
    }
  }

  // Weekly trend (last 8 weeks)
  const weeklyTrend: { week: string; created: number; completed: number }[] = [];
  const today = new Date();
  const dow = today.getUTCDay() === 0 ? 7 : today.getUTCDay();
  const monday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (dow - 1)));
  for (let i = 7; i >= 0; i--) {
    const ws = new Date(monday.getTime() - i * 7 * 86400000);
    const a = ws.getTime();
    const b = a + 7 * 86400000;
    const created = wos.filter((w) => {
      const ms = new Date(w.createdAt).getTime();
      return ms >= a && ms < b;
    }).length;
    const completed = wos.filter((w) => {
      if (!w.actualEnd) return false;
      const ms = new Date(w.actualEnd).getTime();
      return ms >= a && ms < b;
    }).length;
    weeklyTrend.push({ week: ws.toISOString().slice(0, 10), created, completed });
  }

  const siteNames = new Map(listByTenant("sites", tenantId).map((s) => [s.id, String(s.name)]));
  const costBySite: Record<string, number> = {};
  for (const w of closed) {
    const name = (w.siteId && siteNames.get(w.siteId)) || "Unassigned";
    costBySite[name] = round2((costBySite[name] ?? 0) + nz(w.laborCost) + nz(w.partsCost));
  }

  const dtByAsset = new Map<string, number>();
  for (const d of downs) {
    if (new Date(d.startedAt).getTime() < fromMs) continue;
    const endIso = d.endedAt || toIso;
    dtByAsset.set(d.assetId, round2((dtByAsset.get(d.assetId) ?? 0) + hoursBetweenIso(d.startedAt, endIso)));
  }
  const assetIdx = new Map(assets.map((a) => [a.id, a]));
  const downtimeByAsset = Array.from(dtByAsset.entries())
    .sort((x, y) => y[1] - x[1])
    .slice(0, 8)
    .map(([aid, hours]) => {
      const a = assetIdx.get(aid);
      return a ? { asset: `${a.tag} · ${a.name}`, hours } : null;
    })
    .filter(Boolean);

  const requestsOpen = listByTenant("maintenance-requests", tenantId).filter((r) =>
    ["SUBMITTED", "ACKNOWLEDGED", "TRIAGED"].includes(r.status),
  ).length;

  return {
    periodDays: days,
    from: fromIso,
    to: toIso,
    backlog,
    overdue,
    emergencyOpen,
    mttrHours: kpiBox(repairHours, repairs.length, "Σ repair hours / repairs"),
    mtbfHours: kpiBox(assetHours - downHours, failures.length, "Σ operating hours / unplanned failures"),
    availabilityPct: kpiBox((assetHours - downHours) * 100, assetHours, "(period − downtime) / period × 100"),
    downtimeHours: downHours,
    pmCompliancePct: kpiBox(onTimePm * 100, occs.length, "PM completed within window / PM due × 100"),
    slaBreachPct: kpiBox(breached * 100, slaScoped.length, "Breached / SLA-scoped closed × 100"),
    slaAtRisk,
    laborCost,
    partsCost,
    maintenanceCost: round2(laborCost + partsCost),
    plannedWorkPct: kpiBox(planned * 100, closed.length, "Planned closed / all closed × 100"),
    closedCount: closed.length,
    workOrdersByStatus,
    openByType,
    openByPriority,
    weeklyTrend,
    costBySite,
    downtimeByAsset,
    requestsOpen,
    assetCount: assets.length,
    assetsOutOfService: assets.filter((a) =>
      ["OUT_OF_SERVICE", "UNDER_MAINTENANCE", "QUARANTINED"].includes(a.status),
    ).length,
    assetsLockedOut: assets.filter((a) => a.safetyState === "LOCKED_OUT").length,
  };
}

// ------------------------------------------------------------------ Predictive & Insights

const MIN_READINGS = 8;
const MIN_FAILURES = 3;
const Z_LIMIT = 3.0;

function zScore(
  meter: EntityRecord,
  series: number[],
  basis: string,
): { meter: EntityRecord; latest: number; mean: number; sd: number; z: number; n: number; basis: string } | null {
  if (series.length < MIN_READINGS) return null;
  const n = series.length - 1;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += series[i];
  mean /= n;
  let variance = 0;
  for (let i = 0; i < n; i++) variance += Math.pow(series[i] - mean, 2);
  const sd = Math.sqrt(variance / (n - 1));
  if (sd < 1e-9) return null;
  const latest = series[n];
  const z = (latest - mean) / sd;
  return Math.abs(z) >= Z_LIMIT ? { meter, latest, mean, sd, z, n, basis } : null;
}

function meterAnomalies(tenantId: string) {
  const out: NonNullable<ReturnType<typeof zScore>>[] = [];
  const readings = listByTenant("meter-readings", tenantId).filter((r) => r.accepted);
  for (const m of listByTenant("meters", tenantId)) {
    if (m.status !== "ACTIVE") continue;
    const rs = readings
      .filter((r) => r.meterId === m.id)
      .sort((a, b) => String(a.readingAt).localeCompare(String(b.readingAt)));
    let series: number[] = [];
    let basis = "reading";
    if (m.meterType === "CUMULATIVE") {
      const rates: number[] = [];
      for (let i = 1; i < rs.length; i++) {
        const days = (new Date(rs[i].readingAt).getTime() - new Date(rs[i - 1].readingAt).getTime()) / 86400000;
        if (days > 0.01) rates.push((nz(rs[i].value) - nz(rs[i - 1].value)) / days);
      }
      series = rates;
      basis = "usage rate per day";
    } else {
      series = rs.map((r) => nz(r.value));
    }
    const a = zScore(m, series, basis);
    if (a) out.push(a);
  }
  return out;
}

function forecastAssetFailure(assetId: string) {
  const starts = Array.from(tableOf("downtime-events").values())
    .filter((d) => d.assetId === assetId && d.downtimeType === "UNPLANNED")
    .map((d) => String(d.startedAt))
    .sort();
  if (starts.length < MIN_FAILURES) {
    return {
      failures: starts.length,
      mtbfDays: Number.NaN,
      lastFailure: starts.length ? starts[starts.length - 1] : null,
      predictedNext: null as string | null,
      confidence: 0,
    };
  }
  const firstMs = new Date(starts[0]).getTime();
  const lastMs = new Date(starts[starts.length - 1]).getTime();
  const mtbfDays = (lastMs - firstMs) / 86400000 / (starts.length - 1);
  const nextMs = lastMs + Math.round(mtbfDays * 1440) * 60000;
  const confidence = Math.min(0.9, 0.4 + 0.1 * starts.length);
  return {
    failures: starts.length,
    mtbfDays,
    lastFailure: starts[starts.length - 1],
    predictedNext: new Date(nextMs).toISOString(),
    confidence,
  };
}

export function getAssetReliability(assetId: string): Record<string, unknown> {
  const a = loadEntity("assets", assetId);
  const f = forecastAssetFailure(a.id);
  let downHours = 0;
  const now = nowIso();
  for (const d of tableOf("downtime-events").values()) {
    if (d.assetId === a.id) {
      downHours += hoursBetweenIso(d.startedAt, d.endedAt || now);
    }
  }
  return {
    unplannedFailures: f.failures,
    mtbfDays: Number.isNaN(f.mtbfDays) ? null : Math.round(f.mtbfDays * 10) / 10,
    lastFailure: f.lastFailure,
    predictedNextFailure: f.predictedNext,
    confidence: f.confidence,
    totalDowntimeHours: Math.round(downHours * 10) / 10,
    method: `Mean interval between unplanned failures (minimum ${MIN_FAILURES} failures); next = last failure + MTBF`,
  };
}

export function refreshInsights(tenantId: string): number {
  const existing = new Set(
    listByTenant("ai-insights", tenantId)
      .filter((i) => i.status === "PROPOSED")
      .map((i) => `${i.insightType}:${i.assetId ?? null}:${i.title}`),
  );
  let created = 0;
  const nowMs = Date.now();
  const assets = new Map(listByTenant("assets", tenantId).map((a) => [a.id, a]));

  const add = (
    assetId: string | null,
    insightType: string,
    title: string,
    rationale: string,
    suggestedAction: string,
    confidence: number,
  ) => {
    const key = `${insightType}:${assetId}:${title}`;
    if (existing.has(key)) return;
    existing.add(key);
    persistNew("ai-insights", {
      tenantId,
      assetId,
      insightType,
      title,
      rationale,
      suggestedAction,
      confidence,
      status: "PROPOSED",
    });
    created++;
  };

  // Repeat failures
  const repeats = new Map<string, number>();
  for (const w of listByTenant("work-orders", tenantId)) {
    if (
      w.assetId &&
      (w.workType === "CORRECTIVE" || w.workType === "EMERGENCY") &&
      new Date(w.createdAt).getTime() > nowMs - 90 * 86400000
    ) {
      repeats.set(w.assetId, (repeats.get(w.assetId) ?? 0) + 1);
    }
  }
  for (const [aid, count] of repeats.entries()) {
    if (count < 3) continue;
    const a = assets.get(aid);
    if (!a) continue;
    add(
      a.id,
      "REPEAT_FAILURE",
      `Repeat failures on ${a.name}`,
      `${count} corrective work orders in the last 90 days exceed the threshold of 3.`,
      `Schedule a root-cause analysis and review the PM task list for ${a.tag}.`,
      0.8,
    );
  }

  // Overdue PM
  for (const p of listByTenant("pm-plans", tenantId)) {
    if (p.status === "ACTIVE" && p.nextDueAt && new Date(p.nextDueAt).getTime() < nowMs - 3 * 86400000) {
      add(
        p.assetId,
        "OVERDUE_PM",
        `PM overdue: ${p.name}`,
        `Next due ${p.nextDueAt} has passed by more than 3 days without generated work.`,
        "Generate the PM work order now or adjust the plan schedule.",
        0.95,
      );
    }
  }

  // Low stock
  const parts = findAllEntities("parts", { status: "ACTIVE", size: "5000" }, 5000);
  for (const p of parts) {
    if (p.reorderPoint !== null && p.reorderPoint !== undefined && nz(p.available) <= nz(p.reorderPoint)) {
      add(
        null,
        "LOW_STOCK",
        `Reorder ${p.partNo} ${p.name}`,
        `Available ${p.available} ${p.unit} is at or below reorder point ${p.reorderPoint}.`,
        `Raise a purchase requisition for ${nz(p.reorderQty)} ${p.unit}.`,
        p.criticalSpare ? 0.9 : 0.7,
      );
    }
  }

  // Calibration due within 14 days
  const cutoffDate = addDaysDate(isoDateOnly(), 14);
  for (const c of listByTenant("calibration-plans", tenantId)) {
    if (c.status === "ACTIVE" && c.nextDueOn && String(c.nextDueOn) <= cutoffDate) {
      const a = assets.get(c.assetId);
      add(
        c.assetId,
        "CALIBRATION_DUE",
        `Calibration due: ${a ? a.name : "instrument"}`,
        `Next calibration date ${c.nextDueOn} is within 14 days.`,
        `Schedule a calibration event with ${c.provider}.`,
        0.95,
      );
    }
  }

  // Sensor alarms open
  for (const s of listByTenant("sensor-alerts", tenantId)) {
    if (s.status === "OPEN" && s.severity === "ALARM") {
      const a = assets.get(s.assetId);
      add(
        s.assetId,
        "SENSOR_ALARM",
        `Condition alarm on ${a ? a.name : "asset"}`,
        `Reading ${s.value} breached alarm threshold ${s.threshold}.`,
        "Inspect the asset and convert the alert into a corrective work order if confirmed.",
        0.75,
      );
    }
  }

  // Meter anomalies
  for (const an of meterAnomalies(tenantId)) {
    const a = assets.get(an.meter.assetId);
    add(
      an.meter.assetId,
      "METER_ANOMALY",
      `Unusual ${an.basis}: ${an.meter.name}${a ? ` on ${a.name}` : ""}`,
      `Latest ${an.basis} ${an.latest.toFixed(2)} ${an.meter.unit} is ${an.z.toFixed(1)}σ from its mean ${an.mean.toFixed(2)} (σ ${an.sd.toFixed(2)}) over ${an.n} prior values.`,
      "Inspect the asset and verify the meter; record a meter reset if it was replaced.",
      Math.min(0.9, 0.5 + Math.abs(an.z) / 20),
    );
  }

  // Failure forecast
  for (const a of assets.values()) {
    const f = forecastAssetFailure(a.id);
    if (f.predictedNext && new Date(f.predictedNext).getTime() < nowMs + 14 * 86400000) {
      add(
        a.id,
        "REPEAT_FAILURE",
        `Failure expected soon: ${a.name}`,
        `${f.failures} unplanned failures, mean interval ${f.mtbfDays.toFixed(1)} days; next expected around ${f.predictedNext.slice(0, 10)}.`,
        `Bring forward preventive work or stage critical spares for ${a.tag}.`,
        f.confidence,
      );
    }
  }

  // Long open downtime
  for (const d of listByTenant("downtime-events", tenantId)) {
    if (!d.endedAt && new Date(d.startedAt).getTime() < nowMs - 24 * 3600000) {
      const a = assets.get(d.assetId);
      add(
        d.assetId,
        "SLA_RISK",
        `Extended downtime: ${a ? a.name : "asset"}`,
        `Asset has been down since ${d.startedAt} (over 24 hours).`,
        "Escalate parts availability or contractor support.",
        0.85,
      );
    }
  }

  return created;
}

export function reviewInsight(id: string, accept: boolean): EntityRecord {
  requireRole("MANAGER", "PLANNER");
  const i = loadEntity("ai-insights", id);
  if (i.status !== "PROPOSED") {
    throw ApiError.guard("ALREADY_REVIEWED", `Insight already ${String(i.status).toLowerCase()}`);
  }
  const p = requirePrincipal();
  i.status = accept ? "ACCEPTED" : "REJECTED";
  i.reviewedBy = p.name;
  i.reviewedAt = nowIso();
  return saveDomain("ai-insights", i, accept ? "ACCEPT" : "REJECT", "InsightReviewed.v1", {
    decision: i.status,
  });
}

// ------------------------------------------------------------------ Reports

export function runReport(type: string, fromDate: string, toDate: string): Record<string, unknown> {
  const p = requirePrincipal();
  if (!isInternal(p) || p.scope !== null) {
    throw ApiError.forbidden("Reports are available to internal users of the organization");
  }
  const t = p.tenantId;
  const aIso = `${fromDate}T00:00:00.000Z`;
  const bIso = `${addDaysDate(toDate, 1)}T00:00:00.000Z`;
  const sites = new Map(listByTenant("sites", t).map((s) => [s.id, String(s.name)]));
  const assets = new Map(listByTenant("assets", t).map((x) => [x.id, x]));
  const assetName = (id: string | null | undefined) => {
    if (!id) return "";
    const x = assets.get(id);
    return x ? `${x.tag} · ${x.name}` : "";
  };

  let title = "";
  let columns: string[] = [];
  const rows: unknown[][] = [];

  if (type === "WORK_ORDER_SUMMARY") {
    title = "Work order summary";
    columns = ["Number", "Title", "Type", "Priority", "Status", "Asset", "Site", "Created", "Due", "Labor cost", "Parts cost"];
    for (const w of listByTenant("work-orders", t).sort((m, n) => String(m.createdAt).localeCompare(String(n.createdAt)))) {
      if (w.createdAt < aIso || w.createdAt >= bIso) continue;
      rows.push([
        w.number,
        w.title,
        w.workType,
        w.priority,
        w.status,
        assetName(w.assetId),
        sites.get(w.siteId) ?? "",
        String(w.createdAt).slice(0, 10),
        w.dueAt ? String(w.dueAt).slice(0, 10) : "",
        nz(w.laborCost),
        nz(w.partsCost),
      ]);
    }
  } else if (type === "ASSET_REGISTER") {
    title = "Asset register";
    columns = ["Tag", "Name", "Type", "Manufacturer", "Model", "Serial", "Criticality", "Status", "Safety", "Site", "Warranty end", "Purchase cost"];
    for (const x of Array.from(assets.values()).sort((m, n) => String(m.tag).localeCompare(String(n.tag)))) {
      rows.push([
        x.tag,
        x.name,
        x.assetType,
        x.manufacturer ?? "",
        x.model ?? "",
        x.serialNumber ?? "",
        x.criticality,
        x.status,
        x.safetyState ?? "",
        sites.get(x.siteId) ?? "",
        x.warrantyEnd ?? "",
        nz(x.purchaseCost),
      ]);
    }
  } else if (type === "PM_COMPLIANCE") {
    title = "Preventive maintenance compliance";
    columns = ["Plan", "Asset", "Due", "Status", "Completed", "On time"];
    const plans = new Map(listByTenant("pm-plans", t).map((pl) => [pl.id, pl]));
    for (const o of listByTenant("pm-occurrences", t).sort((m, n) => String(m.dueAt).localeCompare(String(n.dueAt)))) {
      if (!o.dueAt || o.dueAt < aIso || o.dueAt >= bIso) continue;
      const pl = plans.get(o.planId);
      const onTime = Boolean(o.completedAt && new Date(o.completedAt).getTime() <= new Date(o.dueAt).getTime() + 7 * 86400000);
      rows.push([
        pl ? pl.name : "",
        pl ? assetName(pl.assetId) : "",
        o.localDue ?? "",
        o.status,
        o.completedAt ? String(o.completedAt).slice(0, 10) : "",
        onTime ? "Yes" : "No",
      ]);
    }
  } else if (type === "INVENTORY_VALUATION") {
    title = "Inventory valuation";
    columns = ["Part no.", "Name", "Category", "Unit", "On hand", "Reserved", "Available", "Unit cost", "Value", "Reorder point"];
    const parts = findAllEntities("parts", { sort: "partNo,asc", size: "5000" }, 5000);
    for (const x of parts) {
      rows.push([
        x.partNo,
        x.name,
        x.category ?? "",
        x.unit,
        nz(x.onHand),
        nz(x.reserved),
        nz(x.available),
        nz(x.unitCost),
        round2(nz(x.onHand) * nz(x.unitCost)),
        nz(x.reorderPoint),
      ]);
    }
  } else if (type === "SLA_PERFORMANCE") {
    title = "SLA performance";
    columns = ["Number", "Title", "Priority", "Customer SLA due", "Completed", "Breached"];
    for (const w of listByTenant("work-orders", t)
      .filter((x) => Boolean(x.slaDueAt))
      .sort((m, n) => String(m.slaDueAt).localeCompare(String(n.slaDueAt)))) {
      if (w.slaDueAt < aIso || w.slaDueAt >= bIso) continue;
      const breached = w.actualEnd ? w.actualEnd > w.slaDueAt : nowIso() > w.slaDueAt;
      rows.push([
        w.number,
        w.title,
        w.priority,
        String(w.slaDueAt).slice(0, 16).replace("T", " "),
        w.actualEnd ? String(w.actualEnd).slice(0, 16).replace("T", " ") : "Open",
        breached ? "Yes" : "No",
      ]);
    }
  } else if (type === "DOWNTIME") {
    title = "Downtime analysis";
    columns = ["Asset", "Type", "Failure mode", "Impact", "Started", "Ended", "Hours"];
    const now = nowIso();
    for (const d of listByTenant("downtime-events", t).sort((m, n) => String(m.startedAt).localeCompare(String(n.startedAt)))) {
      if (d.startedAt < aIso || d.startedAt >= bIso) continue;
      rows.push([
        assetName(d.assetId),
        d.downtimeType,
        d.failureMode ?? "",
        d.impact ?? "",
        String(d.startedAt).slice(0, 16).replace("T", " "),
        d.endedAt ? String(d.endedAt).slice(0, 16).replace("T", " ") : "Open",
        d.endedAt ? nz(d.durationHours) : hoursBetweenIso(d.startedAt, now),
      ]);
    }
  } else if (type === "CALIBRATION_STATUS") {
    title = "Calibration status";
    columns = ["Instrument", "Standard", "Interval (months)", "Last calibrated", "Next due", "Provider", "State"];
    const today = isoDateOnly();
    const soon = addDaysDate(today, 30);
    for (const c of listByTenant("calibration-plans", t).sort((m, n) => String(m.nextDueOn ?? "").localeCompare(String(n.nextDueOn ?? "")))) {
      const state = !c.nextDueOn
        ? "Unscheduled"
        : String(c.nextDueOn) < today
          ? "Overdue"
          : String(c.nextDueOn) < soon
            ? "Due within 30 days"
            : "Current";
      rows.push([
        assetName(c.assetId),
        c.standard ?? "",
        c.intervalMonths,
        c.lastCalibratedOn ?? "",
        c.nextDueOn ?? "",
        c.provider ?? "",
        state,
      ]);
    }
  } else if (type === "COST_BY_SITE") {
    title = "Maintenance cost by site";
    columns = ["Site", "Closed work orders", "Labor cost", "Parts cost", "Total"];
    const agg = new Map<string, [number, number, number]>();
    for (const w of listByTenant("work-orders", t)) {
      if (w.status !== "CLOSED" || !w.actualEnd || w.actualEnd < aIso || w.actualEnd >= bIso) continue;
      const site = sites.get(w.siteId) ?? "Unassigned";
      const cur = agg.get(site) ?? [0, 0, 0];
      cur[0] += 1;
      cur[1] = round2(cur[1] + nz(w.laborCost));
      cur[2] = round2(cur[2] + nz(w.partsCost));
      agg.set(site, cur);
    }
    for (const [site, vals] of agg.entries()) {
      rows.push([site, vals[0], vals[1], vals[2], round2(vals[1] + vals[2])]);
    }
  } else {
    throw ApiError.notFound(`Report ${type}`);
  }

  return {
    type,
    title,
    from: fromDate,
    to: toDate,
    generatedAt: nowIso(),
    generatedBy: p.name,
    columns,
    rows,
  };
}

export function registerAnalyticsHooks(): void {
  registerHook({
    path: "report-jobs",
    beforeCreate: (j) => {
      j.requestedBy = requirePrincipal().name;
      try {
        const today = isoDateOnly();
        const r = runReport(j.reportType, addDaysDate(today, -365), today);
        j.rowCount = (r.rows as unknown[]).length;
        j.status = "COMPLETED";
      } catch {
        j.status = "FAILED";
      }
      j.completedAt = nowIso();
    },
  });
}

// ------------------------------------------------------------------ Workspace

const SEARCHABLE = [
  "work-orders",
  "assets",
  "maintenance-requests",
  "parts",
  "pm-plans",
  "customers",
  "work-permits",
  "vendors",
  "purchase-orders",
  "documents",
  "locations",
  "technicians",
];

export function globalSearch(q: string): Record<string, unknown>[] {
  const p = requirePrincipal();
  if (!q || q.trim().length < 2) return [];
  const out: Record<string, unknown>[] = [];
  for (const path of SEARCHABLE) {
    if (p.role === "CUSTOMER" && !CUSTOMER_READABLE.has(path)) continue;
    try {
      const def = getResourceDef(path);
      const { items } = listResources(path, { q: q.trim(), size: "5" });
      for (const i of items) {
        out.push({
          resource: path,
          resourceLabel: def.singular,
          id: i.id,
          label: i._label,
          status: i.status ?? null,
        });
      }
    } catch {
      // Skip unreadable resources
    }
  }
  return out;
}

export function myNotifications(): EntityRecord[] {
  const p = requirePrincipal();
  return listByTenant("notifications", p.tenantId)
    .filter(
      (n) =>
        n.recipient === null ||
        n.recipient === undefined ||
        String(n.recipient).toLowerCase() === p.email.toLowerCase() ||
        n.recipient === `role:${p.role}`,
    )
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 30);
}

export function markNotificationRead(id: string): Record<string, unknown> {
  const p = requirePrincipal();
  const n = tableOf("notifications").get(id);
  const mine =
    n &&
    n.tenantId === p.tenantId &&
    (n.recipient === null ||
      n.recipient === undefined ||
      String(n.recipient).toLowerCase() === p.email.toLowerCase() ||
      n.recipient === `role:${p.role}`);
  if (!mine || !n) throw ApiError.notFound("Notification");
  n.status = "READ";
  tableOf("notifications").set(n.id, n);
  return { ok: true };
}

export function technicianMyWork(): Record<string, unknown> {
  const p = requirePrincipal();
  if (p.role === "CUSTOMER") throw ApiError.forbidden("Not available");
  const techs = listByTenant("technicians", p.tenantId).filter((t) => t.userId === p.userId);
  const technician = techs.length === 0 ? null : getResource("technicians", techs[0].id);
  let items: Record<string, unknown>[] = [];
  if (techs.length > 0) {
    const activeStatuses = new Set(["PLANNED", "DISPATCHED", "IN_PROGRESS", "ON_HOLD", "WORK_COMPLETED"]);
    const wos = listByTenant("work-orders", p.tenantId)
      .filter((w) => w.assigneeId === techs[0].id && activeStatuses.has(w.status))
      .sort((a, b) => String(a.dueAt ?? "9999").localeCompare(String(b.dueAt ?? "9999")));
    items = toMaps(getResourceDef("work-orders"), wos);
  }
  return { technician, items };
}

export function portalSummary(): Record<string, unknown> {
  const p = requirePrincipal();
  const cid = p.customerId;
  if (!cid && !isInternal(p)) throw ApiError.forbidden("No customer linked");
  const t = p.tenantId;
  const matchCust = (r: EntityRecord) => !cid || r.customerId === cid;
  return {
    assets: listByTenant("assets", t).filter(matchCust).length,
    openRequests: listByTenant("maintenance-requests", t).filter(
      (r) => matchCust(r) && ["SUBMITTED", "ACKNOWLEDGED", "TRIAGED"].includes(r.status),
    ).length,
    activeWork: listByTenant("work-orders", t).filter(
      (r) => matchCust(r) && !["CLOSED", "CANCELLED"].includes(r.status),
    ).length,
    awaitingSignoff: listByTenant("work-orders", t).filter(
      (r) => matchCust(r) && ["WORK_COMPLETED", "REVIEWED"].includes(r.status),
    ).length,
    pendingQuotes: listByTenant("quotes", t).filter((r) => matchCust(r) && r.status === "SENT").length,
    activeContracts: listByTenant("service-contracts", t).filter((r) => matchCust(r) && r.status === "ACTIVE").length,
  };
}

// ------------------------------------------------------------------ Offline Sync

function checkSyncDevice(deviceId: string): void {
  const p = requirePrincipal();
  const devices = listByTenant("devices", p.tenantId).filter((d) => d.name === deviceId);
  if (devices.some((d) => d.status === "REVOKED")) {
    throw ApiError.forbidden("This device has been revoked; local queued data cannot be synchronized");
  }
  if (devices.some((d) => p.userId && d.userId !== p.userId)) {
    throw ApiError.forbidden("This device is registered to another user");
  }
  let mine = devices.find((d) => p.userId && d.userId === d.userId) ?? null;
  if (!mine && p.userId) {
    mine = persistNew("devices", {
      userId: p.userId,
      name: deviceId,
      platform: deviceId.startsWith("MOB-") ? "ANDROID" : "WEB",
      status: "TRUSTED",
    });
  }
  if (mine) {
    mine.lastSyncAt = nowIso();
    tableOf("devices").set(mine.id, mine);
  }
}

export function pushSyncOperations(body: Record<string, unknown>): Record<string, unknown> {
  const p = requirePrincipal();
  const deviceId = body.deviceId ? String(body.deviceId) : null;
  if (deviceId) checkSyncDevice(deviceId);
  const ops = Array.isArray(body.operations) ? (body.operations as Record<string, unknown>[]) : [];
  const store = getStore();
  const receipts = store.syncOperations.get(p.tenantId) ?? [];
  store.syncOperations.set(p.tenantId, receipts);

  const results = ops.map((op) => {
    const opId = op.clientOperationId ? String(op.clientOperationId).trim() : null;
    const type = op.type ? String(op.type).trim() : null;
    if (!opId || !type) {
      return { clientOperationId: opId, outcome: "REJECTED", message: "clientOperationId and type are required" };
    }
    const prior = receipts.find((r) => r.clientOperationId === opId);
    if (prior) {
      return {
        clientOperationId: opId,
        outcome: prior.outcome,
        message: prior.message,
        replayed: true,
      };
    }

    let outcome = "ACCEPTED";
    let message = "Applied";
    let resultId: string | null = null;
    try {
      const payload = (op.payload as Record<string, unknown>) ?? {};
      if (type === "TASK_RECORD") {
        const t = recordWorkTask(String(payload.workOrderId), String(payload.taskId), payload);
        resultId = t.id;
      } else if (type === "WO_TRANSITION") {
        const b = { ...payload, version: op.baseVersion };
        const wo = transitionWorkOrder(String(payload.workOrderId), String(payload.to ?? ""), null, b);
        resultId = wo.id;
      } else if (type === "METER_READING" || type === "TIME_ENTRY") {
        const path = type === "METER_READING" ? "meter-readings" : "time-entries";
        const b = { ...payload };
        if (type === "METER_READING" && !b.source) b.source = "MOBILE";
        const created = createResource(path, b, `sync:${opId}`);
        resultId = String(created.id);
      } else {
        throw ApiError.invalid(`Unsupported operation type ${type}`);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if ([409, 412, 428].includes(err.status)) outcome = "CONFLICT";
        else if (err.code.startsWith("PERMIT")) outcome = "REQUIRES_ONLINE_REVIEW";
        else outcome = "REJECTED";
        message = err.message;
      } else {
        outcome = "REJECTED";
        message = "Operation could not be applied";
      }
    }

    const rec: SyncReceipt = {
      id: newUuid(),
      tenantId: p.tenantId,
      clientOperationId: opId,
      deviceId,
      actor: p.name,
      operationType: type,
      outcome,
      message,
      resultId,
      receivedAt: nowIso(),
    };
    receipts.push(rec);
    return { clientOperationId: opId, outcome, message };
  });

  return { serverTime: nowIso(), results };
}

export function getSyncChanges(since?: string | null): Record<string, unknown> {
  const p = requirePrincipal();
  const fromIso = since || new Date(0).toISOString();
  const wos = findAllEntities("work-orders", { size: "200" }, 200).filter((w) => w.updatedAt >= fromIso);
  const receipts = (getStore().syncOperations.get(p.tenantId) ?? [])
    .filter((r) => r.actor === p.name)
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
    .slice(0, 50);
  return {
    serverTime: nowIso(),
    workOrders: toMaps(getResourceDef("work-orders"), wos),
    receipts,
  };
}
