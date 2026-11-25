package com.opesware.maintain.platformadmin.application;

import com.opesware.maintain.identity.domain.AppUser;
import com.opesware.maintain.identity.infrastructure.AppUserRepository;
import com.opesware.maintain.onboarding.application.ContactService;
import com.opesware.maintain.onboarding.application.SignupService;
import com.opesware.maintain.onboarding.domain.ContactMessage;
import com.opesware.maintain.onboarding.domain.SignupRequest;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.AuditService;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.domain.Tenant;
import com.opesware.maintain.platform.infrastructure.TenantRepo;
import com.opesware.maintain.platform.notify.NotificationService;
import com.opesware.maintain.platform.security.CurrentUser;
import com.opesware.maintain.platform.security.MfaPolicy;
import com.opesware.maintain.platform.security.PasswordHasher;
import com.opesware.maintain.platform.security.Principal;
import com.opesware.maintain.platform.security.TokenService;
import jakarta.persistence.EntityManager;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The OPES operator console: oversight of every customer workspace, plan and trial management, suspension,
 * sign-up approval, website messages and audited, read-only support sessions. Operators are administrators of
 * the platform workspace (tenant code {@code opes.platform.tenant-code}); no tenant role can become one.
 */
@Service
public class PlatformService {
    private static final Set<String> PLANS = Set.of("TRIAL", "STARTER", "PROFESSIONAL", "ENTERPRISE", "PERPETUAL", "SOURCE");
    private static final long MAX_SUPPORT_MINUTES = 120;

    private final TenantRepo tenants;
    private final AppUserRepository users;
    private final EntityManager em;
    private final CrudService crud;
    private final AuditService audit;
    private final NotificationService notifications;
    private final TokenService tokens;
    private final SignupService signups;
    private final ContactService contact;
    private final String platformCode;

    public PlatformService(TenantRepo tenants, AppUserRepository users, EntityManager em, CrudService crud, AuditService audit,
                           NotificationService notifications, TokenService tokens, SignupService signups, ContactService contact,
                           @Value("${opes.platform.tenant-code:opes-platform}") String platformCode) {
        this.tenants = tenants;
        this.users = users;
        this.em = em;
        this.crud = crud;
        this.audit = audit;
        this.notifications = notifications;
        this.tokens = tokens;
        this.signups = signups;
        this.contact = contact;
        this.platformCode = platformCode;
    }

    // ------------------------------------------------------------------ guard

    /** Only administrators of the platform workspace pass. Everyone else gets 404, so the console is not discoverable. */
    public Principal requireOperator() {
        Principal p = CurrentUser.require();
        boolean ok = p.is("ADMIN") && tenants.findById(p.tenantId()).map(t -> platformCode.equals(t.code)).orElse(false);
        if (!ok) throw ApiException.notFound("Page");
        return p;
    }

    private UUID platformTenantId() {
        return tenants.findByCode(platformCode).map(t -> t.id).orElse(null);
    }

    // ------------------------------------------------------------------ overview & companies

    @Transactional(readOnly = true)
    public Map<String, Object> overview() {
        requireOperator();
        List<Tenant> all = customers();
        Instant now = Instant.now();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("companies", all.size());
        m.put("active", all.stream().filter(t -> !"SUSPENDED".equals(t.status)).count());
        m.put("suspended", all.stream().filter(t -> "SUSPENDED".equals(t.status)).count());
        m.put("onTrial", all.stream().filter(t -> "TRIAL".equals(t.plan) && t.trialEndsAt != null && t.trialEndsAt.isAfter(now)).count());
        m.put("trialsEndingIn7Days", all.stream().filter(t -> "TRIAL".equals(t.plan) && t.trialEndsAt != null
                && t.trialEndsAt.isAfter(now) && t.trialEndsAt.isBefore(now.plus(Duration.ofDays(7)))).count());
        m.put("trialsExpired", all.stream().filter(t -> "TRIAL".equals(t.plan) && t.trialEndsAt != null && t.trialEndsAt.isBefore(now)).count());
        m.put("newLast7Days", all.stream().filter(t -> t.createdAt != null && t.createdAt.isAfter(now.minus(Duration.ofDays(7)))).count());
        m.put("newLast30Days", all.stream().filter(t -> t.createdAt != null && t.createdAt.isAfter(now.minus(Duration.ofDays(30)))).count());
        m.put("setupIncomplete", all.stream().filter(t -> t.onboardingStep != null).count());
        m.put("pendingSignups", signups.pendingReview().size());
        m.put("newMessages", contact.recent(true).size());
        Map<UUID, Long> u = countBy("AppUser"), a = countBy("Asset");
        m.put("users", all.stream().mapToLong(t -> u.getOrDefault(t.id, 0L)).sum());
        m.put("assets", all.stream().mapToLong(t -> a.getOrDefault(t.id, 0L)).sum());
        return m;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> companies(String q, String status) {
        requireOperator();
        Map<UUID, Long> u = countBy("AppUser"), a = countBy("Asset"), w = countBy("WorkOrder");
        Map<UUID, Instant> lastLogin = lastLogin();
        String needle = q == null ? "" : q.trim().toLowerCase(Locale.ROOT);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Tenant t : customers()) {
            if (!needle.isEmpty() && !(t.legalName + " " + t.code).toLowerCase(Locale.ROOT).contains(needle)) continue;
            if (status != null && !status.isBlank() && !status.equalsIgnoreCase(statusOf(t))) continue;
            Map<String, Object> m = summary(t);
            m.put("users", u.getOrDefault(t.id, 0L));
            m.put("assets", a.getOrDefault(t.id, 0L));
            m.put("workOrders", w.getOrDefault(t.id, 0L));
            Instant ll = lastLogin.get(t.id);
            m.put("lastLoginAt", ll == null ? null : ll.toString());
            out.add(m);
        }
        out.sort(Comparator.comparing((Map<String, Object> m) -> String.valueOf(m.get("createdAt"))).reversed());
        return out;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> company(UUID id) {
        requireOperator();
        Tenant t = customer(id);
        Map<String, Object> m = summary(t);
        m.put("users", countBy("AppUser").getOrDefault(id, 0L));
        m.put("assets", countBy("Asset").getOrDefault(id, 0L));
        m.put("workOrders", countBy("WorkOrder").getOrDefault(id, 0L));
        m.put("sites", countBy("Site").getOrDefault(id, 0L));
        m.put("pmPlans", countBy("PmPlan").getOrDefault(id, 0L));
        List<Map<String, Object>> admins = new ArrayList<>();
        for (AppUser x : users.findByTenantId(id)) {
            if (!"ADMIN".equals(x.role) && !"MANAGER".equals(x.role)) continue;
            Map<String, Object> am = new LinkedHashMap<>();
            am.put("fullName", x.fullName); am.put("email", x.email); am.put("role", x.role); am.put("phone", x.phone);
            am.put("status", x.status); am.put("lastLoginAt", x.lastLoginAt == null ? null : x.lastLoginAt.toString());
            admins.add(am);
        }
        m.put("administrators", admins);
        return m;
    }

    @Transactional
    public Map<String, Object> suspend(UUID id, String reason) {
        Principal op = requireOperator();
        Tenant t = customer(id);
        if (reason == null || reason.isBlank()) throw ApiException.invalid("Give a reason for the suspension");
        t.status = "SUSPENDED";
        tenants.save(t);
        record(t.id, op, "TENANT_SUSPENDED", Map.of("reason", reason));
        return company(id);
    }

    @Transactional
    public Map<String, Object> reactivate(UUID id) {
        Principal op = requireOperator();
        Tenant t = customer(id);
        t.status = "ACTIVE";
        tenants.save(t);
        record(t.id, op, "TENANT_REACTIVATED", Map.of());
        return company(id);
    }

    @Transactional
    public Map<String, Object> extendTrial(UUID id, int days) {
        Principal op = requireOperator();
        if (days < 1 || days > 180) throw ApiException.invalid("Extend by 1 to 180 days");
        Tenant t = customer(id);
        Instant base = t.trialEndsAt != null && t.trialEndsAt.isAfter(Instant.now()) ? t.trialEndsAt : Instant.now();
        t.trialEndsAt = base.plus(Duration.ofDays(days));
        tenants.save(t);
        record(t.id, op, "TRIAL_EXTENDED", Map.of("days", days, "trialEndsAt", t.trialEndsAt.toString()));
        return company(id);
    }

    @Transactional
    public Map<String, Object> setPlan(UUID id, Map<String, Object> body) {
        Principal op = requireOperator();
        Tenant t = customer(id);
        String plan = String.valueOf(body.getOrDefault("plan", t.plan)).toUpperCase(Locale.ROOT);
        if (!PLANS.contains(plan)) throw ApiException.invalid("Unknown plan " + plan);
        t.plan = plan;
        t.maxUsers = intOrNull(body.get("maxUsers"), t.maxUsers);
        t.maxAssets = intOrNull(body.get("maxAssets"), t.maxAssets);
        if (!"TRIAL".equals(plan)) t.trialEndsAt = null;
        tenants.save(t);
        Map<String, Object> d = new HashMap<>();
        d.put("plan", plan); d.put("maxUsers", t.maxUsers); d.put("maxAssets", t.maxAssets);
        record(t.id, op, "PLAN_CHANGED", d);
        return company(id);
    }

    // ------------------------------------------------------------------ support sessions

    /**
     * Opens a read-only support session in a customer workspace: a visible "OPES Support (read-only)" auditor account,
     * a token valid for at most two hours, an audit entry and a notification to the company's administrators.
     */
    @Transactional
    public Map<String, Object> supportSession(UUID id, String reason, int minutes) {
        Principal op = requireOperator();
        if (reason == null || reason.trim().length() < 5) throw ApiException.invalid("Describe why you need access (at least 5 characters)");
        long mins = Math.max(5, Math.min(MAX_SUPPORT_MINUTES, minutes));
        Tenant t = customer(id);
        String email = "support+" + t.code + MfaPolicy.SUPPORT_EMAIL_DOMAIN;
        AppUser support = users.findByTenantId(t.id).stream().filter(x -> email.equalsIgnoreCase(x.email)).findFirst().orElse(null);
        if (support == null) {
            support = CurrentUser.runAsSystem(t.id, () -> {
                AppUser u = new AppUser();
                u.fullName = "OPES Support (read-only)";
                u.email = email;
                u.role = "AUDITOR";
                u.jobTitle = "OPES Maintain support";
                u.status = "ACTIVE";
                u.language = t.language;
                u.mfaEnabled = false;
                AppUser saved = crud.persistNew(u);
                saved.passwordHash = PasswordHasher.hash(UUID.randomUUID().toString()); // never used: no password sign-in
                return users.save(saved);
            });
        }
        support.status = "ACTIVE";
        users.save(support);
        String token = tokens.issue(support.id, mins * 60);
        Instant until = Instant.now().plus(Duration.ofMinutes(mins));
        record(t.id, op, "SUPPORT_SESSION_OPENED", Map.of("reason", reason.trim(), "minutes", mins, "until", until.toString()));
        CurrentUser.runAsSystem(t.id, () -> notifications.notify("role:ADMIN", "SUPPORT",
                "OPES support opened a read-only session", "Reason: " + reason.trim() + ". Access ends at " + until + " (UTC).", "/m/audit-events"));
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("token", token);
        m.put("expiresAt", until.toString());
        m.put("company", t.legalName);
        return m;
    }

    // ------------------------------------------------------------------ sign-ups & messages

    @Transactional(readOnly = true)
    public List<Map<String, Object>> pendingSignups() {
        requireOperator();
        List<Map<String, Object>> out = new ArrayList<>();
        for (SignupRequest r : signups.pendingReview()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("email", r.email); m.put("fullName", r.fullName); m.put("company", r.companyName); m.put("country", r.country);
            m.put("phone", r.phone); m.put("industry", r.industry); m.put("createdAt", r.createdAt.toString());
            out.add(m);
        }
        return out;
    }

    @Transactional
    public Map<String, Object> decideSignup(String email, String action) {
        Principal op = requireOperator();
        if ("reject".equalsIgnoreCase(action)) {
            signups.reject(email);
            return Map.of("email", email, "status", "REJECTED");
        }
        UUID tenantId = signups.approve(email).tenantId();
        record(tenantId, op, "SIGNUP_APPROVED", Map.of("email", email));
        return Map.of("email", email, "status", "APPROVED", "tenantId", tenantId.toString());
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> messages(boolean all) {
        requireOperator();
        List<Map<String, Object>> out = new ArrayList<>();
        for (ContactMessage c : contact.recent(!all)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("createdAt", c.createdAt.toString()); m.put("status", c.status); m.put("topic", c.topic); m.put("name", c.name);
            m.put("email", c.email); m.put("phone", c.phone); m.put("company", c.company); m.put("country", c.country);
            m.put("language", c.language); m.put("message", c.message);
            out.add(m);
        }
        return out;
    }

    @Transactional
    public Map<String, Object> markMessagesRead() {
        requireOperator();
        return Map.of("markedRead", contact.markAllRead());
    }

    // ------------------------------------------------------------------ helpers

    private List<Tenant> customers() {
        UUID platform = platformTenantId();
        return tenants.findAll().stream().filter(t -> !t.id.equals(platform)).toList();
    }

    private Tenant customer(UUID id) {
        Tenant t = tenants.findById(id).orElseThrow(() -> ApiException.notFound("Company"));
        if (platformCode.equals(t.code)) throw ApiException.notFound("Company");
        return t;
    }

    private static String statusOf(Tenant t) {
        if ("SUSPENDED".equals(t.status)) return "SUSPENDED";
        if ("TRIAL".equals(t.plan)) return t.trialEndsAt != null && t.trialEndsAt.isBefore(Instant.now()) ? "TRIAL_EXPIRED" : "TRIAL";
        return "ACTIVE";
    }

    private Map<String, Object> summary(Tenant t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", t.id.toString());
        m.put("code", t.code);
        m.put("name", t.legalName);
        m.put("status", statusOf(t));
        m.put("plan", t.plan);
        m.put("country", t.country);
        m.put("currency", t.currency);
        m.put("language", t.language);
        m.put("industry", t.industry);
        m.put("source", t.source);
        m.put("maxUsers", t.maxUsers);
        m.put("maxAssets", t.maxAssets);
        m.put("trialEndsAt", t.trialEndsAt == null ? null : t.trialEndsAt.toString());
        m.put("createdAt", t.createdAt == null ? null : t.createdAt.toString());
        m.put("setupComplete", t.onboardingStep == null);
        return m;
    }

    private Map<UUID, Long> countBy(String entity) {
        Map<UUID, Long> m = new HashMap<>();
        for (Object[] r : em.createQuery("select e.tenantId, count(e) from " + entity + " e group by e.tenantId", Object[].class).getResultList()) {
            m.put((UUID) r[0], (Long) r[1]);
        }
        return m;
    }

    private Map<UUID, Instant> lastLogin() {
        Map<UUID, Instant> m = new HashMap<>();
        for (Object[] r : em.createQuery("select u.tenantId, max(u.lastLoginAt) from AppUser u group by u.tenantId", Object[].class).getResultList()) {
            if (r[1] != null) m.put((UUID) r[0], (Instant) r[1]);
        }
        return m;
    }

    /** Records an operator action in the customer's own audit trail, attributed to the named operator. */
    private void record(UUID tenantId, Principal op, String action, Map<String, ?> detail) {
        Principal previous = CurrentUser.get();
        CurrentUser.set(new Principal(op.userId(), tenantId, op.email(), "OPES operator " + op.name(), "ADMIN", null));
        try {
            audit.record(action, "Tenant", tenantId, detail);
        } finally {
            if (previous == null) CurrentUser.clear(); else CurrentUser.set(previous);
        }
    }

    private static Integer intOrNull(Object v, Integer fallback) {
        if (v == null || String.valueOf(v).isBlank()) return fallback;
        try { return Integer.valueOf(String.valueOf(v)); } catch (NumberFormatException e) { throw ApiException.invalid("Limits must be whole numbers"); }
    }
}
