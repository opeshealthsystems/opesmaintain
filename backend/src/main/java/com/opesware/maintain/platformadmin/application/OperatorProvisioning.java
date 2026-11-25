package com.opesware.maintain.platformadmin.application;

import com.opesware.maintain.identity.domain.AppUser;
import com.opesware.maintain.identity.infrastructure.AppUserRepository;
import com.opesware.maintain.organization.domain.Organization;
import com.opesware.maintain.organization.infrastructure.OrganizationRepository;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.domain.Tenant;
import com.opesware.maintain.platform.infrastructure.TenantRepo;
import com.opesware.maintain.platform.security.CurrentUser;
import com.opesware.maintain.platform.security.PasswordHasher;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Creates the internal platform workspace and its operator accounts (run from the server, never from the web). */
@Service
public class OperatorProvisioning {
    private final TenantRepo tenants;
    private final AppUserRepository users;
    private final OrganizationRepository organizations;
    private final CrudService crud;
    private final String code;

    public OperatorProvisioning(TenantRepo tenants, AppUserRepository users, OrganizationRepository organizations, CrudService crud,
                                @Value("${opes.platform.tenant-code:opes-platform}") String code) {
        this.tenants = tenants;
        this.users = users;
        this.organizations = organizations;
        this.crud = crud;
        this.code = code;
    }

    @Transactional
    public Map<String, Object> addOperator(String rawEmail, String fullName) {
        String email = rawEmail == null ? "" : rawEmail.trim().toLowerCase(Locale.ROOT);
        if (!email.matches("^[^@\\s]+@[^@\\s]+\\.[A-Za-z]{2,}$")) throw ApiException.invalid("Valid e-mail required");
        if (users.findFirstByEmailIgnoreCase(email).isPresent()) throw ApiException.conflict("EMAIL_IN_USE", "An account already uses " + email);
        Tenant t = tenants.findByCode(code).orElseGet(() -> {
            Tenant n = new Tenant();
            n.id = UUID.randomUUID();
            n.code = code;
            n.legalName = "OPES Platform (Opesware Technologies)";
            n.country = "CM";
            n.timeZone = "Africa/Douala";
            n.currency = "XAF";
            n.language = "EN";
            n.plan = "ENTERPRISE";
            n.status = "ACTIVE";
            n.source = "PLATFORM";
            n.createdAt = Instant.now();
            return tenants.save(n);
        });
        return CurrentUser.runAsSystem(t.id, () -> {
            UUID orgId = organizations.findByTenantId(t.id).stream().map(o -> o.id).findFirst().orElseGet(() -> {
                Organization o = new Organization();
                o.code = "OPES";
                o.name = "Opesware Technologies";
                o.kind = "OWNER";
                o.country = "CM";
                o.status = "ACTIVE";
                return crud.persistNew(o).id;
            });
            AppUser u = new AppUser();
            u.fullName = fullName == null || fullName.isBlank() ? email : fullName.trim();
            u.email = email;
            u.role = "ADMIN";
            u.organizationId = orgId;
            u.jobTitle = "Platform operator";
            u.status = "ACTIVE";
            u.language = "EN";
            u.mfaEnabled = true;
            AppUser saved = crud.persistNew(u);
            saved.passwordHash = PasswordHasher.hash(UUID.randomUUID().toString()); // replaced with opes-set-password
            users.save(saved);
            return Map.<String, Object>of("email", email, "tenant", code, "next", "Set a password with: opes-set-password " + email);
        });
    }
}
