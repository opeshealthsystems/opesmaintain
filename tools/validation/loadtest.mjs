// Reference-workload test against spec §15.1 objectives.
// Usage: node tools/validation/loadtest.mjs http://localhost:8080 [concurrency]
const BASE = (process.argv[2] ?? "http://localhost:8080") + "/api/v1";
const CONC = Number(process.argv[3] ?? 20);

async function req(path, opts = {}, token) {
  const t0 = performance.now();
  const r = await fetch(BASE + path, { method: opts.method ?? (opts.body ? "POST" : "GET"), headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers ?? {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const ms = performance.now() - t0;
  const text = await r.text();
  return { status: r.status, ms, json: text && text.startsWith("{") || text.startsWith("[") ? JSON.parse(text) : null };
}
const p = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const login = async (email) => (await req("/auth/login", { body: { email, password: "OpesDemo2026" } })).json.token;
const results = [];
function report(name, samples, target, errors = 0) {
  const r = { name, n: samples.length, p50: Math.round(p(samples, 0.5)), p95: Math.round(p(samples, 0.95)), max: Math.round(Math.max(...samples)), target, errors, pass: p(samples, 0.95) <= target && errors === 0 };
  results.push(r);
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${name.padEnd(42)} n=${r.n} p50=${r.p50}ms p95=${r.p95}ms max=${r.max}ms target p95<=${target}ms errors=${errors}`);
}
async function pool(n, total, fn) {
  const out = []; let i = 0; let errors = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < total) { const k = i++; try { const r = await fn(k); out.push(r.ms); if (r.status >= 400) errors++; } catch { errors++; } } }));
  return { out, errors };
}

const admin = await login("admin@opes.demo");
const manager = await login("manager@opes.demo");
const stores = await login("stores@opes.demo");
const tech = await login("tech@opes.demo");

// 1. Interactive list/detail
const paths = ["/work-orders?size=25", "/assets?size=25", "/parts?size=25", "/maintenance-requests?size=25", "/work-orders?q=pump&size=25", "/stock-movements?size=25"];
const wos = (await req("/work-orders?size=50", {}, admin)).json.items;
let r = await pool(CONC, 600, (k) => k % 2 ? req(paths[k % paths.length], {}, admin) : req(`/work-orders/${wos[k % wos.length].id}`, {}, admin));
report("Interactive list/detail (§15.1 ≤500ms)", r.out, 500, r.errors);

// 2. Work-order transitions (DRAFT→TRIAGED→ON_HOLD→RESUME cycles on fresh orders)
const site = (await req("/sites?size=1", {}, admin)).json.items[0].id;
const ts = []; let terr = 0;
await Promise.all(Array.from({ length: 10 }, async (_, w) => {
  for (let i = 0; i < 5; i++) {
    const wo = (await req("/work-orders", { body: { title: `Load ${w}-${i}`, workType: "CORRECTIVE", priority: "LOW", siteId: site } }, manager)).json;
    let v = wo.version;
    for (const to of ["TRIAGED", "APPROVED"]) {
      const x = await req(`/work-orders/${wo.id}:transition`, { body: { to }, headers: { "If-Match": String(v) } }, manager);
      ts.push(x.ms); if (x.status >= 400) terr++; else v = x.json.version;
    }
  }
}));
report("Work-order transition (≤1s)", ts, 1000, terr);

// 3. Sync batch of 50 operations (meter readings)
const meter = (await req("/meters?size=1&meterType=CUMULATIVE", {}, admin)).json.items[0];
const syncMs = []; let serr = 0; let base = Number(meter.lastReading ?? 0) + 1;
for (let b = 0; b < 10; b++) {
  const ops = Array.from({ length: 50 }, (_, k) => ({ clientOperationId: crypto.randomUUID(), type: "METER_READING", payload: { meterId: meter.id, value: String(base + b * 50 + k), readingAt: new Date(Date.now() + (b * 50 + k) * 1000).toISOString() } }));
  const x = await req("/mobile/sync/operations", { body: { deviceId: "LOAD-1", operations: ops } }, tech);
  syncMs.push(x.ms);
  if (x.status >= 400 || x.json.results.some((o) => o.outcome !== "ACCEPTED")) serr++;
}
report("Sync batch, 50 operations (≤10s)", syncMs, 10000, serr);

// 4. Reports
const rep = []; let rerr = 0;
for (const t of ["WORK_ORDER_SUMMARY", "ASSET_REGISTER", "PM_COMPLIANCE", "INVENTORY_VALUATION", "SLA_PERFORMANCE", "DOWNTIME", "CALIBRATION_STATUS", "COST_BY_SITE"]) {
  const x = await req(`/reports/${t}?from=2025-01-01&to=2027-01-01`, {}, admin); rep.push(x.ms); if (x.status >= 400) rerr++;
}
report("Report generation (≤60s)", rep, 60000, rerr);

// 5. Data integrity under contention: duplicate retries and over-reservation races
const part = (await req("/parts", { body: { partNo: `LT-${Date.now()}`, name: "Load test part", unit: "pcs", unitCost: 1 } }, stores)).json;
const wh = (await req("/warehouses?size=1", {}, admin)).json.items[0].id;
await req("/stock-receipts", { body: { partId: part.id, warehouseId: wh, quantity: 10, clientOperationId: crypto.randomUUID() } }, stores);
const wo = wos.find((w) => !["CLOSED", "CANCELLED"].includes(w.status));
const sameOp = crypto.randomUUID();
const dup = await Promise.all(Array.from({ length: 20 }, () => req("/stock-reservations", { body: { partId: part.id, warehouseId: wh, workOrderId: wo.id, quantity: 1, clientOperationId: sameOp } }, stores)));
const race = await Promise.all(Array.from({ length: 30 }, () => req("/stock-reservations", { body: { partId: part.id, warehouseId: wh, workOrderId: wo.id, quantity: 1, clientOperationId: crypto.randomUUID() } }, stores)));
const resv = (await req(`/stock-reservations?partId=${part.id}&size=200`, {}, stores)).json.items;
const reserved = resv.reduce((s, x) => s + Number(x.quantity), 0);
const dupIds = new Set(dup.filter((d) => d.status < 300).map((d) => d.json.id));
const integrity = dupIds.size === 1 && reserved <= 10 && race.filter((x) => x.status < 300).length === 9;
console.log(`${integrity ? "PASS" : "FAIL"}  Integrity: 20 retries of one operation -> ${dupIds.size} reservation; 30 racing reservations for 9 remaining units -> ${race.filter((x) => x.status < 300).length} accepted; total reserved ${reserved}/10 on hand`);
results.push({ name: "Stock integrity under contention", pass: integrity, detail: { idempotentRetries: dupIds.size, raceAccepted: race.filter((x) => x.status < 300).length, reserved } });

const ok = results.every((x) => x.pass);
console.log(JSON.stringify({ concurrency: CONC, results, pass: ok }));
process.exit(ok ? 0 : 1);
