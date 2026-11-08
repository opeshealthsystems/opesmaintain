package com.opesware.maintain.identity.application;

import com.opesware.maintain.identity.domain.AppUser;
import com.opesware.maintain.identity.domain.Delegation;
import com.opesware.maintain.identity.infrastructure.AppUserRepository;
import com.opesware.maintain.identity.infrastructure.DelegationRepository;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.AuditService;
import com.opesware.maintain.platform.security.CurrentUser;
import com.opesware.maintain.platform.security.Principal;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Service;

/**
 * Temporary delegated authority (OM-M02-004). A delegation counts only while ACTIVE, inside its
 * validity window, and while the delegator is still active. Use of a delegation is audited.
 */
@Service
public class DelegationService {
    private final DelegationRepository delegations;
    private final AppUserRepository users;
    private final AuditService audit;

    public DelegationService(DelegationRepository delegations, AppUserRepository users, AuditService audit) {
        this.delegations = delegations;
        this.users = users;
        this.audit = audit;
    }

    public Optional<Delegation> active(Principal p, String permission) {
        if (p == null || p.userId() == null) return Optional.empty();
        Instant now = Instant.now();
        return delegations.findByDelegateId(p.userId()).stream()
                .filter(d -> p.tenantId().equals(d.tenantId) && permission.equals(d.permission) && "ACTIVE".equals(d.status)
                        && d.validFrom != null && d.validTo != null && !now.isBefore(d.validFrom) && now.isBefore(d.validTo))
                .filter(d -> users.findById(d.delegatorId).map(u -> "ACTIVE".equals(u.status)).orElse(false))
                .findFirst();
    }

    public boolean has(String permission) {
        return active(CurrentUser.get(), permission).isPresent();
    }

    /** Passes when the caller holds one of the roles or an active delegation for the permission. */
    public void requireRoleOrDelegation(String permission, String... roles) {
        Principal p = CurrentUser.require();
        if (p.is("ADMIN") || p.is(roles)) return;
        Delegation d = active(p, permission).orElseThrow(() -> ApiException.forbidden("Requires one of roles: " + String.join(", ", roles)));
        AppUser delegator = users.findById(d.delegatorId).orElseThrow();
        audit.record("DELEGATION_USED", "Delegation", d.id, Map.of("permission", permission, "onBehalfOf", delegator.fullName));
    }
}
