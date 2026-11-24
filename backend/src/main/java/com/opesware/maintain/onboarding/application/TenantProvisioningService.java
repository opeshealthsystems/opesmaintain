package com.opesware.maintain.onboarding.application;

import com.opesware.maintain.identity.domain.AppUser;
import com.opesware.maintain.identity.infrastructure.AppUserRepository;
import com.opesware.maintain.onboarding.domain.SignupRequest;
import com.opesware.maintain.organization.domain.Organization;
import com.opesware.maintain.platform.application.AuditService;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.domain.Tenant;
import com.opesware.maintain.platform.infrastructure.TenantRepo;
import com.opesware.maintain.platform.security.CurrentUser;
import java.text.Normalizer;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Creates a new, empty, isolated workspace for a self-service sign-up: tenant on the trial plan,
 * the company as OWNER organization, and its first ADMIN user. Everything happens in one transaction.
 */
@Service
public class TenantProvisioningService {
    private final TenantRepo tenants;
    private final CrudService crud;
    private final AppUserRepository users;
    private final AuditService audit;

    public TenantProvisioningService(TenantRepo tenants, CrudService crud, AppUserRepository users, AuditService audit) {
        this.tenants = tenants;
        this.crud = crud;
        this.users = users;
        this.audit = audit;
    }

    public record Provisioned(UUID tenantId, UUID userId) {}

    @Transactional
    public Provisioned provision(SignupRequest r) {
        Regional reg = Regional.of(r.country);
        Instant now = Instant.now();
        Tenant t = new Tenant();
        t.id = UUID.randomUUID();
        t.code = uniqueCode(r.companyName);
        t.legalName = r.companyName;
        t.country = r.country;
        t.timeZone = reg.timeZone();
        t.currency = reg.currency();
        t.language = r.language != null ? r.language : reg.language();
        t.plan = Plans.TRIAL.code();
        t.status = "ACTIVE";
        t.maxUsers = Plans.TRIAL.maxUsers();
        t.maxAssets = Plans.TRIAL.maxAssets();
        t.trialEndsAt = now.plus(Duration.ofDays(Plans.TRIAL.trialDays()));
        t.industry = r.industry;
        t.onboardingStep = "COMPANY";
        t.source = "SELF_SIGNUP";
        t.createdAt = now;
        tenants.save(t);

        return CurrentUser.runAsSystem(t.id, () -> {
            Organization o = new Organization();
            o.code = t.code.toUpperCase(Locale.ROOT);
            o.name = r.companyName;
            o.legalName = r.companyName;
            o.kind = "OWNER";
            o.country = r.country;
            o.timeZone = t.timeZone;
            o.currency = t.currency;
            o.language = t.language;
            o.email = r.email;
            o.phone = r.phone;
            o.status = "ACTIVE";
            o = crud.persistNew(o);

            AppUser u = new AppUser();
            u.fullName = r.fullName;
            u.email = r.email;
            u.role = "ADMIN";
            u.organizationId = o.id;
            u.phone = r.phone;
            u.language = t.language;
            u.jobTitle = "Administrator";
            u.status = "ACTIVE";
            u.mfaEnabled = false;
            u.emailNotifications = true;
            AppUser saved = crud.persistNew(u);
            saved.passwordHash = r.passwordHash;
            users.save(saved);

            audit.record("TENANT_PROVISIONED", "Tenant", t.id,
                    Map.of("source", "SELF_SIGNUP", "plan", t.plan, "company", r.companyName, "admin", r.email));
            return new Provisioned(t.id, saved.id);
        });
    }

    /** Short URL-safe tenant code derived from the company name, e.g. "acme-hospital-7k2q". */
    String uniqueCode(String company) {
        String base = Normalizer.normalize(company == null ? "" : company, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        if (base.length() > 40) base = base.substring(0, 40).replaceAll("-$", "");
        if (base.isEmpty()) base = "company";
        for (int i = 0; i < 20; i++) {
            String code = base + "-" + Long.toString(Math.abs(UUID.randomUUID().getMostSignificantBits()) % 1_679_616, 36);
            if (tenants.findByCode(code).isEmpty()) return code;
        }
        return base + "-" + UUID.randomUUID();
    }

    /** Sensible defaults by country; the company can change them in onboarding. */
    record Regional(String timeZone, String currency, String language) {
        static Regional of(String country) {
            return switch (country == null ? "" : country.toUpperCase(Locale.ROOT)) {
                case "CM" -> new Regional("Africa/Douala", "XAF", "FR");
                case "GA" -> new Regional("Africa/Libreville", "XAF", "FR");
                case "CG" -> new Regional("Africa/Brazzaville", "XAF", "FR");
                case "TD" -> new Regional("Africa/Ndjamena", "XAF", "FR");
                case "CF" -> new Regional("Africa/Bangui", "XAF", "FR");
                case "GQ" -> new Regional("Africa/Malabo", "XAF", "FR");
                case "CD" -> new Regional("Africa/Kinshasa", "CDF", "FR");
                case "CI" -> new Regional("Africa/Abidjan", "XOF", "FR");
                case "SN" -> new Regional("Africa/Dakar", "XOF", "FR");
                case "BJ" -> new Regional("Africa/Porto-Novo", "XOF", "FR");
                case "TG" -> new Regional("Africa/Lome", "XOF", "FR");
                case "BF" -> new Regional("Africa/Ouagadougou", "XOF", "FR");
                case "ML" -> new Regional("Africa/Bamako", "XOF", "FR");
                case "NE" -> new Regional("Africa/Niamey", "XOF", "FR");
                case "NG" -> new Regional("Africa/Lagos", "NGN", "EN");
                case "GH" -> new Regional("Africa/Accra", "GHS", "EN");
                case "KE" -> new Regional("Africa/Nairobi", "KES", "EN");
                case "RW" -> new Regional("Africa/Kigali", "RWF", "FR");
                case "ZA" -> new Regional("Africa/Johannesburg", "ZAR", "EN");
                case "FR", "BE" -> new Regional("Europe/Paris", "EUR", "FR");
                case "GB" -> new Regional("Europe/London", "GBP", "EN");
                case "US" -> new Regional("America/New_York", "USD", "EN");
                case "CA" -> new Regional("America/Toronto", "CAD", "EN");
                default -> new Regional("UTC", "USD", "EN");
            };
        }
    }
}
