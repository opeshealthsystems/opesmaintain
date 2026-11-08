// Automated security probe for spec §16.2 threat scenarios and AT-M02.
// Usage: node tools/validation/security-probe.mjs http://localhost:8080 [http://localhost:3000]
import reg from "../../web/src/generated/registry.json" with { type: "json" };
const API = (process.argv[2] ?? "http://localhost:8080") + "/api/v1";
const WEB = process.argv[3];
const findings = [];
let checks = 0;
const check = (ok, name) => { checks++; if (!ok) findings.push(name); };
const call = async (path, { method, body, token, headers, raw } = {}) => {
  const r = await fetch(API + path, { method: method ?? (body ? "POST" : "GET"), headers: { ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(headers ?? {}) }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  return { status: r.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })(), headers: r.headers };
};
const login = async (e) => (await call("/auth/login", { body: { email: e, password: "OpesDemo2026" } })).json?.token;
const A = await login("admin@opes.demo");
const T = await login("tech@opes.demo");
const C = await login("customer@opes.demo");
const X = await login("admin@isolation.test");

// 1. Deny by default
for (const r of reg.resources) check((await call(`/${r.path}`)).status === 401, `unauthenticated list ${r.path}`);
check((await call("/kpis")).status === 401, "unauthenticated kpis");
check((await call("/work-orders", { token: A + "x" })).status === 401, "tampered token accepted");
check((await call("/work-orders", { token: "e30.e30.e30" })).status === 401, "forged unsigned JWT accepted");

// 2. Cross-tenant guessing (AT-M02) — detail, export, attachments, search, commands, sync
for (const r of reg.resources) {
  const one = (await call(`/${r.path}?size=1`, { token: A })).json?.items?.[0];
  if (!one) continue;
  check((await call(`/${r.path}/${one.id}`, { token: X })).status === 404, `cross-tenant read ${r.path}`);
  if (!r.readonly) check([403, 404].includes((await call(`/${r.path}/${one.id}`, { method: "PATCH", token: X, body: { name: "x" }, headers: { "If-Match": String(one.version) } })).status), `cross-tenant write ${r.path}`);
}
const exportX = await call("/work-orders/export.csv", { token: X });
check(!exportX.text.includes("WO-0000"), "cross-tenant data in CSV export");
const doc = (await call("/documents?size=1", { token: A })).json.items[0];
check((await call(`/documents/${doc.id}/download`, { token: X })).status === 404, "cross-tenant attachment download");
check(((await call("/search?q=ventilator", { token: X })).json ?? []).length === 0, "cross-tenant search leak");
const wo = (await call("/work-orders?status=DRAFT&size=1", { token: A })).json.items[0];
check((await call(`/work-orders/${wo.id}:transition`, { token: X, body: { to: "TRIAGED", version: wo.version } })).status === 404, "cross-tenant command");
check(((await call(`/reports/WORK_ORDER_SUMMARY?from=2020-01-01&to=2030-01-01`, { token: X })).json?.rows ?? [1]).length === 0, "cross-tenant report rows");
const sync = await call("/mobile/sync/operations", { token: X, body: { operations: [{ clientOperationId: crypto.randomUUID(), type: "WO_TRANSITION", payload: { workOrderId: wo.id, to: "TRIAGED" }, baseVersion: wo.version }] } });
check(sync.json?.results?.[0]?.outcome !== "ACCEPTED", "cross-tenant offline sync accepted");

// 3. Client-supplied tenant id never confers access
const created = await call("/failure-codes", { token: X, body: { code: `SEC-${Date.now()}`, name: "probe", codeType: "PROBLEM", tenantId: "00000000-0000-0000-0000-000000000000" } });
check(created.status === 201 && (await call(`/failure-codes/${created.json.id}`, { token: A })).status === 404, "tenantId in body crossed tenants");

// 4. Privilege escalation and role scope
check((await call("/users", { token: T, body: { fullName: "x", email: `x${Date.now()}@x`, role: "ADMIN" } })).status === 403, "technician created a user");
check((await call("/audit-events", { token: T })).status === 403, "technician read audit trail");
check((await call("/work-orders", { token: await login("auditor@opes.demo"), body: { title: "x", workType: "CORRECTIVE", priority: "LOW", siteId: wo.siteId } })).status === 403, "auditor wrote data");
check((await call("/parts", { token: C })).status === 403, "customer read internal inventory");
const custWos = (await call("/work-orders?size=200", { token: C })).json.items;
check(custWos.every((w) => w.customerIdLabel === "Sanaga Pharma Company"), "customer saw another customer's work orders");
const otherWo = (await call("/work-orders?size=200", { token: A })).json.items.find((w) => w.customerIdLabel !== "Sanaga Pharma Company");
check((await call(`/work-orders/${otherWo.id}`, { token: C })).status === 404, "customer read foreign work order by id");
check((await call("/users/" + (await call("/users?size=1", { token: A })).json.items[0].id + ":set-password", { token: await login("manager@opes.demo"), body: { password: "Escalate12345" } })).status === 403, "manager reset password");
check(!(await call("/users?size=5", { token: A })).text.includes("pbkdf2"), "password hashes exposed");

// 5. Injection
const inj = await call(`/work-orders?q=${encodeURIComponent("' OR '1'='1")}&sort=${encodeURIComponent("title;drop table work_order")}`, { token: A });
check(inj.status === 200 && inj.json.total === 0, "SQL injection via q/sort");
const formula = await call("/failure-codes", { token: A, body: { code: `F-${Date.now()}`, name: "=HYPERLINK(\"http://evil\")", codeType: "PROBLEM" } });
check((await call("/failure-codes/export.csv", { token: A })).text.includes("\"'=HYPERLINK"), "CSV formula injection not neutralised");
check(formula.status === 201, "formula probe setup");

// 6. Malicious upload, path traversal, error leakage
const d = (await call("/documents", { token: A, body: { title: "probe", docType: "OTHER" } })).json;
const fd = new FormData();
fd.append("file", new Blob(["MZ\x90\x00 malicious"], { type: "application/pdf" }), "../../../etc/evil.pdf");
const up = await call(`/documents/${d.id}/file`, { token: A, body: fd });
check(up.json?.status === "QUARANTINED", "executable accepted as PDF");
check(!String(up.json?.fileName).includes("/"), "path traversal in stored file name");
check((await call(`/documents/${d.id}/download`, { token: A })).status === 422, "quarantined file downloadable");
const bad = await call("/work-orders/not-a-uuid", { token: A });
check(!/Exception|at com\.|java\./.test(bad.text), "stack trace leaked in error");
const stale = await call(`/work-orders/${wo.id}`, { method: "PATCH", token: A, body: { title: "x" }, headers: { "If-Match": "999" } });
check(stale.status === 412, "lost update not prevented");

// 7. Web security headers
if (WEB) {
  const h = (await fetch(WEB + "/login")).headers;
  check(h.get("x-frame-options") === "DENY", "missing X-Frame-Options");
  check(h.get("x-content-type-options") === "nosniff", "missing nosniff");
  check(!!h.get("referrer-policy"), "missing Referrer-Policy");
  check(!h.get("x-powered-by"), "X-Powered-By disclosed");
}

console.log(`${checks} checks, ${findings.length} finding(s)`);
for (const f of findings) console.log("FINDING:", f);
process.exit(findings.length ? 1 : 0);
