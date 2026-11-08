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

    public AuthController(AppUserRepository users, TokenService tokens, TenantRepo tenants, AuditService audit, CrudService crud) {
        this.users = users;
        this.tokens = tokens;
        this.tenants = tenants;
        this.audit = audit;
        this.crud = crud;
    }

    @PostMapping("/auth/login")
    @Transactional
    public Map<String, Object> login(@RequestBody Map<String, String> body) {
        String email = body.getOrDefault("email", "").trim().toLowerCase();
        AppUser u = users.findAll().stream().filter(x -> email.equalsIgnoreCase(x.email)).findFirst().orElse(null);
        if (u == null || !PasswordHasher.verify(body.get("password"), u.passwordHash)) {
            throw new ApiException(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
        }
        if (!"ACTIVE".equals(u.status)) throw new ApiException(403, "ACCOUNT_DISABLED", "This account is " + u.status.toLowerCase());
        u.lastLoginAt = Instant.now();
        users.save(u);
        CurrentUser.set(new Principal(u.id, u.tenantId, u.email, u.fullName, u.role, u.customerId));
        try {
            audit.record("LOGIN", "User", u.id, Map.of("email", u.email));
        } finally {
            CurrentUser.clear();
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("token", tokens.issue(u.id));
        m.put("expiresIn", tokens.ttlSeconds());
        m.put("user", profile(u));
        return m;
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
        return m;
    }
}
