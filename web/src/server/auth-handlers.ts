import crypto from "node:crypto";
import { getResource, loadEntity, toMaps } from "./crud";
import {
  buildPrincipalFromUser,
  getTokenTtlSeconds,
  hashPassword,
  isMfaEnrollmentRequired,
  issueToken,
  newTotpSecret,
  recordAudit,
  requireRole,
  resolveScope,
  totpUri,
  verifyPassword,
  verifyTotp,
} from "./security";
import {
  actorName,
  getStore,
  listByTenant,
  nowIso,
  requirePrincipal,
  requireTenantId,
  runWithPrincipal,
  tableOf,
} from "./store";
import {
  ApiError,
  getResourceDef,
  RESOURCES,
  type EntityRecord,
  type TenantRecord,
} from "./types";

const MAX_FAILED_LOGINS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

function findUserByEmail(email: string): EntityRecord | null {
  const norm = email.trim().toLowerCase();
  for (const u of tableOf("users").values()) {
    if (String(u.email ?? "").toLowerCase() === norm) return u;
  }
  return null;
}

function auditAsUser(u: EntityRecord, action: string, detail: Record<string, unknown> = {}): void {
  const p = buildPrincipalFromUser(u);
  runWithPrincipal(p, () => recordAudit(action, "User", u.id, detail));
}

function validatePasswordStrength(pw: unknown): string {
  const s = typeof pw === "string" ? pw : "";
  if (s.length < 10 || !/\d/.test(s) || !/[A-Za-z]/.test(s)) {
    throw ApiError.invalid("Password must be at least 10 characters with letters and digits");
  }
  return s;
}

export function buildUserProfile(u: EntityRecord): Record<string, unknown> {
  const t = getStore().tenants.get(u.tenantId);
  return {
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    role: u.role,
    language: u.language || "EN",
    customerId: u.customerId ?? null,
    siteId: u.siteId ?? null,
    tenantName: t?.legalName ?? "",
    currency: t?.currency ?? "XAF",
    timeZone: t?.timeZone ?? "UTC",
    mfaEnrolled: Boolean(u.mfaEnrolledAt),
    scoped: resolveScope(u) !== null,
    mfaEnrollmentRequired: isMfaEnrollmentRequired(u),
    emailNotifications: u.emailNotifications !== false,
  };
}

export function handleLogin(body: Record<string, unknown>): Record<string, unknown> {
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const u = findUserByEmail(email);
  const invalid = new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");

  if (!u) {
    throw invalid;
  }

  const nowMs = Date.now();
  if (u.lockedUntil && new Date(u.lockedUntil).getTime() > nowMs) {
    auditAsUser(u, "LOGIN_BLOCKED_LOCKED", {});
    throw new ApiError(
      429,
      "TOO_MANY_ATTEMPTS",
      "Too many failed attempts. Try again later or contact your administrator.",
    );
  }

  if (!verifyPassword(password, u.passwordHash)) {
    const failed = Number(u.failedLogins ?? 0) + 1;
    if (failed >= MAX_FAILED_LOGINS) {
      u.lockedUntil = new Date(nowMs + LOCK_DURATION_MS).toISOString();
      u.failedLogins = 0;
    } else {
      u.failedLogins = failed;
    }
    tableOf("users").set(u.id, u);
    auditAsUser(u, u.lockedUntil && new Date(u.lockedUntil).getTime() > nowMs ? "ACCOUNT_LOCKED" : "LOGIN_FAILED", {
      factor: "password",
    });
    throw invalid;
  }

  if (u.status !== "ACTIVE") {
    throw new ApiError(403, "ACCOUNT_DISABLED", `This account is ${String(u.status).toLowerCase()}`);
  }

  if (u.mfaEnrolledAt) {
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!code) {
      throw new ApiError(401, "MFA_REQUIRED", "Enter the 6-digit code from your authenticator app");
    }
    if (!verifyTotp(u.mfaSecret, code)) {
      const failed = Number(u.failedLogins ?? 0) + 1;
      if (failed >= MAX_FAILED_LOGINS) {
        u.lockedUntil = new Date(nowMs + LOCK_DURATION_MS).toISOString();
        u.failedLogins = 0;
      } else {
        u.failedLogins = failed;
      }
      tableOf("users").set(u.id, u);
      auditAsUser(u, "LOGIN_FAILED", { factor: "mfa" });
      throw new ApiError(401, "MFA_INVALID", "The code is not valid. Check your device time and try again.");
    }
  }

  u.failedLogins = 0;
  u.lockedUntil = null;
  u.lastLoginAt = nowIso();
  tableOf("users").set(u.id, u);
  auditAsUser(u, "LOGIN", { email: u.email, mfa: Boolean(u.mfaEnrolledAt) });

  return {
    token: issueToken(u.id),
    expiresIn: getTokenTtlSeconds(),
    user: buildUserProfile(u),
  };
}

export function handleForgotPassword(body: Record<string, unknown>): Record<string, unknown> {
  const email = String(body.email ?? "").trim().toLowerCase();
  const u = findUserByEmail(email);
  if (u && u.status === "ACTIVE" && !String(u.email).endsWith("@invalid")) {
    const rawToken = crypto.randomBytes(32).toString("base64url");
    u.resetTokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    u.resetTokenExpires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    tableOf("users").set(u.id, u);
    auditAsUser(u, "PASSWORD_RESET_REQUESTED", {});
  }
  return {
    ok: true,
    message: "If an account exists for this address, a reset link has been sent.",
  };
}

export function handleResetPassword(body: Record<string, unknown>): Record<string, unknown> {
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const password = body.password;
  const invalidToken = () =>
    new ApiError(400, "RESET_TOKEN_INVALID", "This reset link is invalid or has expired. Request a new one.");
  if (!token) throw invalidToken();
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  let found: EntityRecord | null = null;
  for (const u of tableOf("users").values()) {
    if (u.resetTokenHash === hash) {
      found = u;
      break;
    }
  }
  if (!found) throw invalidToken();
  if (!found.resetTokenExpires || new Date(found.resetTokenExpires).getTime() < Date.now() || found.status !== "ACTIVE") {
    found.resetTokenHash = null;
    tableOf("users").set(found.id, found);
    throw invalidToken();
  }
  const pw = validatePasswordStrength(password);
  found.passwordHash = hashPassword(pw);
  found.resetTokenHash = null;
  found.resetTokenExpires = null;
  found.failedLogins = 0;
  found.lockedUntil = null;
  found.tokensValidAfter = nowIso();
  tableOf("users").set(found.id, found);
  auditAsUser(found, "PASSWORD_RESET_COMPLETED", {});
  return { ok: true };
}

export function handleGetMe(): Record<string, unknown> {
  const p = requirePrincipal();
  const u = p.userId ? tableOf("users").get(p.userId) : null;
  if (!u) throw ApiError.unauthorized();
  return buildUserProfile(u);
}

export function handleGetPermissions(): Record<string, unknown> {
  const p = requirePrincipal();
  let writable: string[] = [];
  for (const d of RESOURCES) {
    if (!d.readonly && (p.role === "ADMIN" || d.writerRoles.includes(p.role))) {
      writable.push(d.path);
    }
  }
  if (p.role === "CUSTOMER") writable = ["maintenance-requests", "service-signoffs"];
  if (p.role === "AUDITOR") writable = [];
  return { role: p.role, writable };
}

export function handlePreferences(body: Record<string, unknown>): Record<string, unknown> {
  const p = requirePrincipal();
  const u = p.userId ? tableOf("users").get(p.userId) : null;
  if (!u) throw ApiError.unauthorized();
  if ("emailNotifications" in body) {
    u.emailNotifications = body.emailNotifications === true;
  }
  if (typeof body.language === "string" && (body.language === "EN" || body.language === "FR")) {
    u.language = body.language;
  }
  u.updatedAt = nowIso();
  tableOf("users").set(u.id, u);
  return buildUserProfile(u);
}

export function handleChangePassword(body: Record<string, unknown>): Record<string, unknown> {
  const p = requirePrincipal();
  const u = p.userId ? tableOf("users").get(p.userId) : null;
  if (!u) throw ApiError.unauthorized();
  if (!verifyPassword(String(body.currentPassword ?? ""), u.passwordHash)) {
    throw ApiError.invalid("Current password is incorrect");
  }
  const pw = validatePasswordStrength(body.newPassword);
  u.passwordHash = hashPassword(pw);
  u.tokensValidAfter = nowIso();
  u.updatedAt = nowIso();
  tableOf("users").set(u.id, u);
  recordAudit("PASSWORD_CHANGED", "User", u.id, {});
  return { ok: true, token: issueToken(u.id) };
}

export function handleMfaStart(): Record<string, unknown> {
  const p = requirePrincipal();
  const u = p.userId ? tableOf("users").get(p.userId) : null;
  if (!u) throw ApiError.unauthorized();
  if (u.mfaEnrolledAt) throw ApiError.guard("MFA_ALREADY_ENROLLED", "Two-step sign-in is already active");
  u.mfaSecret = newTotpSecret();
  tableOf("users").set(u.id, u);
  const t = getStore().tenants.get(u.tenantId);
  const issuer = `OPES Maintain${t ? ` (${t.code})` : ""}`;
  return {
    secret: u.mfaSecret,
    otpauthUri: totpUri(issuer, u.email, u.mfaSecret),
  };
}

export function handleMfaConfirm(body: Record<string, unknown>): Record<string, unknown> {
  const p = requirePrincipal();
  const u = p.userId ? tableOf("users").get(p.userId) : null;
  if (!u) throw ApiError.unauthorized();
  if (!u.mfaSecret || u.mfaEnrolledAt) throw ApiError.guard("MFA_NOT_STARTED", "Start enrolment first");
  if (!verifyTotp(u.mfaSecret, typeof body.code === "string" ? body.code : "")) {
    throw ApiError.invalid("The code is not valid. Check your device time and try again.");
  }
  u.mfaEnrolledAt = nowIso();
  u.mfaEnabled = true;
  u.updatedAt = nowIso();
  tableOf("users").set(u.id, u);
  recordAudit("MFA_ENROLLED", "User", u.id, {});
  return buildUserProfile(u);
}

export function handleAdminSetPassword(id: string, body: Record<string, unknown>): Record<string, unknown> {
  requireRole("ADMIN");
  const u = loadEntity("users", id);
  const pw = validatePasswordStrength(body.password);
  u.passwordHash = hashPassword(pw);
  u.tokensValidAfter = nowIso();
  u.updatedAt = nowIso();
  tableOf("users").set(u.id, u);
  recordAudit("PASSWORD_RESET", "User", u.id, { by: actorName() });
  return { ok: true };
}

export function handleUnlockUser(id: string): Record<string, unknown> {
  requireRole("ADMIN");
  const u = loadEntity("users", id);
  u.lockedUntil = null;
  u.failedLogins = 0;
  u.updatedAt = nowIso();
  tableOf("users").set(u.id, u);
  recordAudit("ACCOUNT_UNLOCKED", "User", u.id, { by: actorName() });
  return { ok: true };
}

export function handleResetMfa(id: string): Record<string, unknown> {
  requireRole("ADMIN");
  const u = loadEntity("users", id);
  u.mfaSecret = null;
  u.mfaEnrolledAt = null;
  u.tokensValidAfter = nowIso();
  u.updatedAt = nowIso();
  tableOf("users").set(u.id, u);
  recordAudit("MFA_RESET", "User", u.id, { by: actorName() });
  return { ok: true };
}

export function handleRevokeSessions(id: string): Record<string, unknown> {
  requireRole("ADMIN");
  const u = loadEntity("users", id);
  u.tokensValidAfter = nowIso();
  u.updatedAt = nowIso();
  tableOf("users").set(u.id, u);
  recordAudit("SESSIONS_REVOKED", "User", u.id, { by: actorName() });
  return { ok: true };
}

export function handleExportPersonalData(id: string): Record<string, unknown> {
  requireRole("ADMIN");
  const u = loadEntity("users", id);
  const devices = listByTenant("devices", u.tenantId).filter((d) => d.userId === u.id);
  const delegations = listByTenant("delegations", u.tenantId).filter(
    (d) => d.delegatorId === u.id || d.delegateId === u.id,
  );
  const techs = listByTenant("technicians", u.tenantId).filter((t) => t.userId === u.id);
  const techIds = new Set(techs.map((t) => t.id));
  const entries = listByTenant("time-entries", u.tenantId).filter((e) => techIds.has(e.technicianId));
  const notifications = listByTenant("notifications", u.tenantId).filter((n) => n.recipient === u.email);
  const auditEvents = listByTenant("audit-events", u.tenantId).filter((a) => a.actor === u.fullName);

  recordAudit("PERSONAL_DATA_EXPORTED", "User", u.id, { by: actorName() });
  return {
    exportedAt: nowIso(),
    profile: getResource("users", u.id),
    devices: toMaps(getResourceDef("devices"), devices),
    delegations: toMaps(getResourceDef("delegations"), delegations),
    technicianProfiles: toMaps(getResourceDef("technicians"), techs),
    timeEntries: toMaps(getResourceDef("time-entries"), entries),
    notifications: toMaps(getResourceDef("notifications"), notifications),
    auditEvents: toMaps(getResourceDef("audit-events"), auditEvents),
  };
}

export function handlePseudonymiseUser(id: string): Record<string, unknown> {
  requireRole("ADMIN");
  const u = loadEntity("users", id);
  if (u.status !== "OFFBOARDED") {
    throw ApiError.guard("NOT_OFFBOARDED", "Offboard the user before pseudonymising their personal data");
  }
  const alias = `Former user ${u.id.slice(0, 8)}`;
  u.fullName = alias;
  u.email = `erased-${u.id}@invalid`;
  u.phone = null;
  u.jobTitle = null;
  u.mfaSecret = null;
  u.mfaEnrolledAt = null;
  u.passwordHash = null;
  u.tokensValidAfter = nowIso();
  u.updatedAt = nowIso();
  tableOf("users").set(u.id, u);

  for (const t of listByTenant("technicians", u.tenantId)) {
    if (t.userId === u.id) {
      t.fullName = alias;
      t.phone = null;
      tableOf("technicians").set(t.id, t);
    }
  }
  recordAudit("PERSONAL_DATA_PSEUDONYMISED", "User", u.id, { alias });
  return { ok: true, alias };
}

export function handleGetTenant(): TenantRecord {
  const t = getStore().tenants.get(requireTenantId());
  if (!t) throw ApiError.notFound("Tenant");
  return t;
}

export function handleUpdateTenant(body: Record<string, unknown>): TenantRecord {
  requireRole("ADMIN");
  const t = getStore().tenants.get(requireTenantId());
  if (!t) throw ApiError.notFound("Tenant");
  if (typeof body.legalName === "string") t.legalName = body.legalName;
  if (typeof body.country === "string") t.country = body.country;
  if (typeof body.timeZone === "string") t.timeZone = body.timeZone;
  if (typeof body.currency === "string") t.currency = body.currency;
  if (typeof body.language === "string") t.language = body.language;
  getStore().tenants.set(t.id, t);
  recordAudit("TENANT_UPDATED", "Tenant", t.id, body);
  return t;
}
