import crypto from "node:crypto";
import {
  actorName,
  getPrincipal,
  listByTenant,
  newUuid,
  nowIso,
  requirePrincipal,
  tableOf,
} from "./store";
import {
  ApiError,
  isInternal,
  isRole,
  type AccessScope,
  type EntityRecord,
  type Principal,
  type ResourceDef,
} from "./types";

// ------------------------------------------------------------------ Audit & Outbox

export function recordAudit(
  action: string,
  entityType: string,
  entityId: string | null,
  detail: Record<string, unknown> = {},
): void {
  const p = getPrincipal();
  if (!p) return;
  const id = newUuid();
  const now = nowIso();
  const row: EntityRecord = {
    id,
    tenantId: p.tenantId,
    version: 0,
    createdAt: now,
    updatedAt: now,
    createdBy: p.name,
    occurredAt: now,
    actor: p.name,
    action,
    entityType,
    entityId: entityId ?? "",
    detail: JSON.stringify(detail),
  };
  tableOf("audit-events").set(id, row);
}

export function publishOutbox(
  eventType: string,
  aggregateType: string,
  aggregateId: string,
  payload: Record<string, unknown> = {},
): void {
  const p = getPrincipal();
  if (!p) return;
  const id = newUuid();
  const now = nowIso();
  const row: EntityRecord = {
    id,
    tenantId: p.tenantId,
    version: 0,
    createdAt: now,
    updatedAt: now,
    createdBy: p.name,
    eventType,
    aggregateType,
    aggregateId,
    status: "DELIVERED",
    attempts: 1,
    occurredAt: now,
    payload: JSON.stringify(payload),
  };
  tableOf("outbox-events").set(id, row);
}

// ------------------------------------------------------------------ Password Hashing

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(raw: string | null | undefined, stored: string | null | undefined): boolean {
  if (!raw || !stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  try {
    const expected = Buffer.from(parts[2], "hex");
    const actual = crypto.scryptSync(raw, parts[1], 32);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ Token Service (HMAC-SHA256)

const TOKEN_TTL_SECONDS = 8 * 3600;

function tokenSecret(): string {
  return process.env.OPES_TOKEN_SECRET || "opes-dev-secret-change-in-production-0123456789";
}

export function getTokenTtlSeconds(): number {
  return TOKEN_TTL_SECONDS;
}

export function issueToken(userId: string): string {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + TOKEN_TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({ sub: userId, iat, exp }), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", tokenSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyToken(token: string): { userId: string; iat: number; exp: number } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto.createHmac("sha256", tokenSecret()).update(payload).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      sub?: string;
      iat?: number;
      exp?: number;
    };
    if (!parsed.sub || !parsed.exp || !parsed.iat) return null;
    if (Math.floor(Date.now() / 1000) > parsed.exp) return null;
    return { userId: parsed.sub, iat: parsed.iat, exp: parsed.exp };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ TOTP (RFC 6238)

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function newTotpSecret(): string {
  const bytes = crypto.randomBytes(20);
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function decodeBase32(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(key: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(bin % 1_000_000).padStart(6, "0");
}

export function verifyTotp(secret: string | null | undefined, code: string | null | undefined): boolean {
  if (!secret || !code) return false;
  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) return false;
  const key = decodeBase32(secret);
  const step = Math.floor(Date.now() / 30000);
  for (let delta = -1; delta <= 1; delta++) {
    if (hotp(key, step + delta) === trimmed) return true;
  }
  return false;
}

export function totpUri(issuer: string, email: string, secret: string): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// ------------------------------------------------------------------ Scope Resolver

const SITE_SCOPED_ROLES = new Set(
  (process.env.OPES_SITE_SCOPED_ROLES || "TECHNICIAN")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

function isGrantEffective(g: EntityRecord, today: string): boolean {
  if (g.status !== "ACTIVE") return false;
  if (g.validFrom && today < String(g.validFrom)) return false;
  if (g.validTo && today > String(g.validTo)) return false;
  return true;
}

function splitTokens(text: string | null | undefined): Set<string> {
  if (!text) return new Set();
  return new Set(
    String(text)
      .split(/[,;\n]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function resolveScope(user: EntityRecord): AccessScope | null {
  if (user.role === "ADMIN") return null;
  const org = user.organizationId ? tableOf("organizations").get(user.organizationId) : null;
  const sites = listByTenant("sites", user.tenantId);
  const assets = listByTenant("assets", user.tenantId);

  if (!org || org.kind !== "SERVICE_PROVIDER") {
    if (!user.siteId || !SITE_SCOPED_ROLES.has(user.role)) return null;
    const siteSet = new Set<string>([user.siteId]);
    const assetSet = new Set<string>(
      assets.filter((a) => a.siteId === user.siteId).map((a) => a.id),
    );
    return { sites: siteSet, assets: assetSet };
  }

  const today = new Date().toISOString().slice(0, 10);
  const grants = listByTenant("service-grants", user.tenantId).filter(
    (g) => g.providerOrgId === org.id && isGrantEffective(g, today),
  );
  const siteIds = new Set<string>();
  const assetIds = new Set<string>();

  for (const g of grants) {
    if (g.scope === "ALL_SITES") {
      for (const s of sites) siteIds.add(s.id);
    } else if (g.scope === "SELECTED_SITES") {
      const wanted = splitTokens(g.siteIds);
      for (const s of sites) {
        if (
          wanted.has(s.id.toLowerCase()) ||
          wanted.has(String(s.code ?? "").trim().toLowerCase()) ||
          wanted.has(String(s.name ?? "").trim().toLowerCase())
        ) {
          siteIds.add(s.id);
        }
      }
    } else if (g.scope === "SELECTED_ASSETS") {
      const wanted = splitTokens(g.assetIds);
      for (const a of assets) {
        if (
          wanted.has(a.id.toLowerCase()) ||
          wanted.has(String(a.tag ?? "").trim().toLowerCase())
        ) {
          assetIds.add(a.id);
        }
      }
    }
  }
  for (const a of assets) {
    if (a.siteId && siteIds.has(a.siteId)) assetIds.add(a.id);
  }
  return { sites: siteIds, assets: assetIds };
}

export function buildPrincipalFromUser(user: EntityRecord): Principal {
  return {
    userId: user.id,
    tenantId: user.tenantId,
    email: user.email,
    name: user.fullName,
    role: user.role,
    customerId: user.customerId ?? null,
    scope: resolveScope(user),
  };
}

// ------------------------------------------------------------------ Access Policy

export const CUSTOMER_READABLE = new Set([
  "assets",
  "maintenance-requests",
  "work-orders",
  "service-contracts",
  "quotes",
  "service-signoffs",
  "billing-exports",
]);

export const CUSTOMER_CREATABLE = new Set(["maintenance-requests", "service-signoffs"]);

export const RESTRICTED_READ = new Set([
  "audit-events",
  "users",
  "delegations",
  "devices",
  "settings",
  "outbox-events",
  "integrations",
  "webhook-subscriptions",
  "notifications",
]);

export function canRead(def: ResourceDef): Principal {
  const p = requirePrincipal();
  if (p.role === "CUSTOMER") {
    if (!CUSTOMER_READABLE.has(def.path)) {
      throw ApiError.forbidden("Not available in the customer portal");
    }
    return p;
  }
  if (RESTRICTED_READ.has(def.path) && !isRole(p, "ADMIN", "MANAGER", "AUDITOR")) {
    throw ApiError.forbidden("Requires administrator, manager or auditor role");
  }
  return p;
}

export function canWrite(def: ResourceDef): Principal {
  const p = requirePrincipal();
  if (def.readonly) {
    throw ApiError.forbidden(`${def.label} is read-only; use the domain commands`);
  }
  if (p.role === "CUSTOMER") {
    if (!CUSTOMER_CREATABLE.has(def.path)) {
      throw ApiError.forbidden("Not permitted for customer users");
    }
    return p;
  }
  if (p.role === "AUDITOR") {
    throw ApiError.forbidden("Auditors have read-only access");
  }
  if (!def.writerRoles.includes(p.role)) {
    throw ApiError.forbidden(`Role ${p.role} may not modify ${def.label}`);
  }
  return p;
}

export function requireRole(...roles: string[]): Principal {
  const p = requirePrincipal();
  if (p.role === "ADMIN" || roles.includes(p.role)) return p;
  throw ApiError.forbidden(`Requires one of roles: ${roles.join(", ")}`);
}

// ------------------------------------------------------------------ Delegation

export function activeDelegation(p: Principal | null, permission: string): EntityRecord | null {
  if (!p || !p.userId) return null;
  const now = Date.now();
  const users = tableOf("users");
  for (const d of listByTenant("delegations", p.tenantId)) {
    if (d.delegateId !== p.userId || d.permission !== permission || d.status !== "ACTIVE") continue;
    if (!d.validFrom || !d.validTo) continue;
    const fromMs = new Date(d.validFrom).getTime();
    const toMs = new Date(d.validTo).getTime();
    if (now < fromMs || now >= toMs) continue;
    const delegator = users.get(d.delegatorId);
    if (!delegator || delegator.status !== "ACTIVE") continue;
    return d;
  }
  return null;
}

export function hasDelegation(permission: string): boolean {
  return activeDelegation(getPrincipal(), permission) !== null;
}

export function requireRoleOrDelegation(permission: string, ...roles: string[]): void {
  const p = requirePrincipal();
  if (p.role === "ADMIN" || roles.includes(p.role)) return;
  const d = activeDelegation(p, permission);
  if (!d) {
    throw ApiError.forbidden(`Requires one of roles: ${roles.join(", ")}`);
  }
  const delegator = tableOf("users").get(d.delegatorId);
  recordAudit("DELEGATION_USED", "Delegation", d.id, {
    permission,
    onBehalfOf: delegator?.fullName ?? d.delegatorId,
  });
}

export function isMfaEnrollmentRequired(user: EntityRecord): boolean {
  const required = process.env.OPES_MFA_REQUIRED === "true";
  if (!required) return false;
  const privileged = new Set(["ADMIN", "MANAGER", "SAFETY_OFFICER", "CALIBRATION_OFFICER", "AUDITOR"]);
  return (privileged.has(user.role) || Boolean(user.mfaEnabled)) && !user.mfaEnrolledAt;
}

export function authenticateAuthorizationHeader(authHeader: string | null): Principal | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  const claims = verifyToken(token);
  if (!claims) return null;
  const user = tableOf("users").get(claims.userId);
  if (!user || user.status !== "ACTIVE") return null;
  if (user.tokensValidAfter) {
    const validAfterSec = Math.floor(new Date(user.tokensValidAfter).getTime() / 1000);
    if (claims.iat < validAfterSec) return null;
  }
  return buildPrincipalFromUser(user);
}

export function notifyInApp(recipient: string | null, subject: string, body: string, link: string): void {
  const p = getPrincipal();
  if (!p) return;
  const id = newUuid();
  const now = nowIso();
  tableOf("notifications").set(id, {
    id,
    tenantId: p.tenantId,
    version: 0,
    createdAt: now,
    updatedAt: now,
    createdBy: actorName(),
    recipient,
    channel: "IN_APP",
    subject,
    body,
    link,
    status: "UNREAD",
    createdOn: now,
    category: "SYSTEM",
    emailStatus: "NONE",
  });
}

export { isInternal, isRole };
