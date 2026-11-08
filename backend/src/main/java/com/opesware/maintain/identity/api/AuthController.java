package com.opesware.maintain.identity.api;

import com.opesware.maintain.identity.domain.AppUser;
import com.opesware.maintain.identity.infrastructure.AppUserRepository;
import com.opesware.maintain.platform.application.Access;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.AuditService;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.application.ResourceCatalog;
import com.opesware.maintain.platform.application.ResourceDef;
import com.opesware.maintain.platform.domain.Tenant;
import com.opesware.maintain.platform.infrastructure.TenantRepo;
import com.opesware.maintain.platform.security.CurrentUser;
import com.opesware.maintain.platform.security.PasswordHasher;
import com.opesware.maintain.platform.security.Principal;
import com.opesware.maintain.platform.security.TokenService;
import com.opesware.maintain.platform.security.Totp;
import com.opesware.maintain.platform.security.MfaPolicy;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class AuthController {
    private final AppUserRepository users;
    private final TokenService tokens;
    private final TenantRepo tenants;
    private final AuditService audit;
    private final CrudService crud;
    private final MfaPolicy mfaPolicy;
    private final com.opesware.maintain.identity.application.PersonalDataService personalData;

    public AuthController(AppUserRepository users, TokenService tokens, TenantRepo tenants, AuditService audit, CrudService crud, MfaPolicy mfaPolicy,
                          com.opesware.maintain.identity.application.PersonalDataService personalData) {
        this.personalData = personalData;
        this.mfaPolicy = mfaPolicy;
        this.users = users;
        this.tokens = tokens;
        this.tenants = tenants;
        this.audit = audit;
        this.crud = crud;
    }

    private static final int MAX_FAILED = 5;
    private static final java.time.Duration LOCK = java.time.Duration.ofMinutes(15);

    @PostMapping("/auth/login")
    @Transactional(noRollbackFor = ApiException.class)
    public Map<String, Object> login(@RequestBody Map<String, String> body) {
        String email = body.getOrDefault("email", "").trim().toLowerCase();
        AppUser u = users.findAll().stream().filter(x -> email.equalsIgnoreCase(x.email)).findFirst().orElse(null);
        ApiException invalid = new ApiException(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
        if (u == null) {
            PasswordHasher.verify(body.get("password"), PasswordHasher.hash("timing-equaliser"));
            throw invalid;
        }
        Instant now = Instant.now();
        if (u.lockedUntil != null && u.lockedUntil.isAfter(now)) {
            auditAs(u, "LOGIN_BLOCKED_LOCKED", Map.of());
            throw new ApiException(429, "TOO_MANY_ATTEMPTS", "Too many failed attempts. Try again later or contact your administrator.");
        }
        if (!PasswordHasher.verify(body.get("password"), u.passwordHash)) {
            failed(u, now, "password");
            throw invalid;
        }
        if (!"ACTIVE".equals(u.status)) throw new ApiException(403, "ACCOUNT_DISABLED", "This account is " + u.status.toLowerCase());
        if (u.mfaEnrolledAt != null) {
            String code = body.get("code");
            if (code == null || code.isBlank()) throw new ApiException(401, "MFA_REQUIRED", "Enter the 6-digit code from your authenticator app");
            if (!Totp.verify(u.mfaSecret, code.trim(), now)) {
                failed(u, now, "mfa");
                throw new ApiException(401, "MFA_INVALID", "The code is not valid. Check your device time and try again.");
            }
        }
        u.failedLogins = 0;
        u.lockedUntil = null;
        u.lastLoginAt = now;
        users.save(u);
        auditAs(u, "LOGIN", Map.of("email", u.email, "mfa", u.mfaEnrolledAt != null));
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("token", tokens.issue(u.id));
        m.put("expiresIn", tokens.ttlSeconds());
        m.put("user", profile(u));
        return m;
    }

    private void failed(AppUser u, Instant now, String factor) {
        u.failedLogins = (u.failedLogins == null ? 0 : u.failedLogins) + 1;
        if (u.failedLogins >= MAX_FAILED) {
            u.lockedUntil = now.plus(LOCK);
            u.failedLogins = 0;
        }
        users.save(u);
        auditAs(u, u.lockedUntil != null && u.lockedUntil.isAfter(now) ? "ACCOUNT_LOCKED" : "LOGIN_FAILED", Map.of("factor", factor));
    }

    private void auditAs(AppUser u, String action, Map<String, ?> detail) {
        Principal prev = CurrentUser.get();
        CurrentUser.set(new Principal(u.id, u.tenantId, u.email, u.fullName, u.role, u.customerId));
        try {
            audit.record(action, "User", u.id, detail);
        } finally {
            if (prev == null) CurrentUser.clear(); else CurrentUser.set(prev);
        }
    }

    // ---------------------------------------------------------------- MFA enrolment
    @PostMapping("/me:preferences")
    @Transactional
    public Map<String, Object> preferences(@RequestBody Map<String, Object> body) {
        AppUser u = users.findById(CurrentUser.require().userId()).orElseThrow();
        if (body.containsKey("emailNotifications")) u.emailNotifications = Boolean.TRUE.equals(body.get("emailNotifications"));
        if (body.get("language") instanceof String l && (l.equals("EN") || l.equals("FR"))) u.language = l;
        users.save(u);
        return profile(u);
    }

    @PostMapping("/me/mfa:start")
    @Transactional
    public Map<String, Object> mfaStart() {
        AppUser u = users.findById(CurrentUser.require().userId()).orElseThrow();
        if (u.mfaEnrolledAt != null) throw ApiException.guard("MFA_ALREADY_ENROLLED", "Two-step sign-in is already active");
        u.mfaSecret = Totp.newSecret();
        users.save(u);
        Tenant t = tenants.findById(u.tenantId).orElse(null);
        return Map.of("secret", u.mfaSecret, "otpauthUri", Totp.uri("OPES Maintain" + (t == null ? "" : " (" + t.code + ")"), u.email, u.mfaSecret));
    }

    @PostMapping("/me/mfa:confirm")
    @Transactional
    public Map<String, Object> mfaConfirm(@RequestBody Map<String, String> body) {
        AppUser u = users.findById(CurrentUser.require().userId()).orElseThrow();
        if (u.mfaSecret == null || u.mfaEnrolledAt != null) throw ApiException.guard("MFA_NOT_STARTED", "Start enrolment first");
        if (!Totp.verify(u.mfaSecret, body.get("code"), Instant.now())) throw ApiException.invalid("The code is not valid. Check your device time and try again.");
        u.mfaEnrolledAt = Instant.now();
        u.mfaEnabled = true;
        users.save(u);
        audit.record("MFA_ENROLLED", "User", u.id, Map.of());
        return profile(u);
    }

    @PostMapping("/users/{id}:reset-mfa")
    @Transactional
    public Map<String, Object> resetMfa(@PathVariable UUID id) {
        Access.requireRole("ADMIN");
        AppUser u = crud.load(AppUser.class, id);
        u.mfaSecret = null;
        u.mfaEnrolledAt = null;
        u.tokensValidAfter = Instant.now();
        users.save(u);
        audit.record("MFA_RESET", "User", u.id, Map.of("by", CurrentUser.actorName()));
        return Map.of("ok", true);
    }

    @PostMapping("/users/{id}:revoke-sessions")
    @Transactional
    public Map<String, Object> revokeSessions(@PathVariable UUID id) {
        Access.requireRole("ADMIN");
        AppUser u = crud.load(AppUser.class, id);
        u.tokensValidAfter = Instant.now();
        users.save(u);
        audit.record("SESSIONS_REVOKED", "User", u.id, Map.of("by", CurrentUser.actorName()));
        return Map.of("ok", true);
    }

    @GetMapping("/users/{id}/personal-data")
    public Map<String, Object> exportPersonalData(@PathVariable UUID id) {
        return personalData.export(id);
    }

    @PostMapping("/users/{id}:pseudonymise")
    public Map<String, Object> pseudonymise(@PathVariable UUID id) {
        return personalData.pseudonymise(id);
    }

    @PostMapping("/users/{id}:unlock")
    @Transactional
    public Map<String, Object> unlock(@PathVariable UUID id) {
        Access.requireRole("ADMIN");
        AppUser u = crud.load(AppUser.class, id);
        u.lockedUntil = null;
        u.failedLogins = 0;
        users.save(u);
        audit.record("ACCOUNT_UNLOCKED", "User", u.id, Map.of("by", CurrentUser.actorName()));
        return Map.of("ok", true);
    }

    @GetMapping("/me")
    @Transactional(readOnly = true)
    public Map<String, Object> me() {
        Principal p = CurrentUser.require();
        return profile(users.findById(p.userId()).orElseThrow(ApiException::unauthorized));
    }

    @GetMapping("/me/permissions")
    public Map<String, Object> permissions() {
        Principal p = CurrentUser.require();
        List<String> writable = new ArrayList<>();
        for (ResourceDef d : ResourceCatalog.all()) {
            if (!d.readonly() && (p.is("ADMIN") || d.writerRoles().contains(p.role()))) writable.add(d.path());
        }
        if (p.is("CUSTOMER")) writable = List.of("maintenance-requests", "service-signoffs");
        if (p.is("AUDITOR")) writable = List.of();
        return Map.of("role", p.role(), "writable", writable);
    }

    @PostMapping("/me:change-password")
    @Transactional
    public Map<String, Object> changePassword(@RequestBody Map<String, String> body) {
        Principal p = CurrentUser.require();
        AppUser u = users.findById(p.userId()).orElseThrow();
        if (!PasswordHasher.verify(body.get("currentPassword"), u.passwordHash)) throw ApiException.invalid("Current password is incorrect");
        setPassword(u, body.get("newPassword"));
        audit.record("PASSWORD_CHANGED", "User", u.id, Map.of());
        return Map.of("ok", true);
    }

    @PostMapping("/users/{id}:set-password")
    @Transactional
    public Map<String, Object> adminSetPassword(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        Access.requireRole("ADMIN");
        AppUser u = crud.load(AppUser.class, id);
        setPassword(u, body.get("password"));
        audit.record("PASSWORD_RESET", "User", u.id, Map.of("by", CurrentUser.actorName()));
        return Map.of("ok", true);
    }

    @GetMapping("/tenant")
    public Tenant tenant() {
        return tenants.findById(CurrentUser.requireTenant()).orElseThrow();
    }

    @PatchMapping("/tenant")
    @Transactional
    public Tenant updateTenant(@RequestBody Map<String, String> body) {
        Access.requireRole("ADMIN");
        Tenant t = tenants.findById(CurrentUser.requireTenant()).orElseThrow();
        if (body.containsKey("legalName")) t.legalName = body.get("legalName");
        if (body.containsKey("country")) t.country = body.get("country");
        if (body.containsKey("timeZone")) t.timeZone = body.get("timeZone");
        if (body.containsKey("currency")) t.currency = body.get("currency");
        if (body.containsKey("language")) t.language = body.get("language");
        audit.record("TENANT_UPDATED", "Tenant", t.id, body);
        return tenants.save(t);
    }

    private void setPassword(AppUser u, String pw) {
        if (pw == null || pw.length() < 10 || !pw.matches(".*\\d.*") || !pw.matches(".*[A-Za-z].*")) {
            throw ApiException.invalid("Password must be at least 10 characters with letters and digits");
        }
        u.passwordHash = PasswordHasher.hash(pw);
        users.save(u);
    }

    private Map<String, Object> profile(AppUser u) {
        Tenant t = tenants.findById(u.tenantId).orElse(null);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", u.id.toString());
        m.put("fullName", u.fullName);
        m.put("email", u.email);
        m.put("role", u.role);
        m.put("language", u.language == null ? "EN" : u.language);
        m.put("customerId", u.customerId == null ? null : u.customerId.toString());
        m.put("siteId", u.siteId == null ? null : u.siteId.toString());
        m.put("tenantName", t == null ? "" : t.legalName);
        m.put("currency", t == null ? "XAF" : t.currency);
        m.put("timeZone", t == null ? "UTC" : t.timeZone);
        m.put("mfaEnrolled", u.mfaEnrolledAt != null);
        m.put("mfaEnrollmentRequired", mfaPolicy.enrollmentRequired(u));
        m.put("emailNotifications", !Boolean.FALSE.equals(u.emailNotifications));
        return m;
    }
}
