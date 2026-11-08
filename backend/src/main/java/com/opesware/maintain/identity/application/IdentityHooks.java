package com.opesware.maintain.identity.application;

import com.opesware.maintain.identity.domain.AppUser;
import com.opesware.maintain.identity.domain.Delegation;
import com.opesware.maintain.identity.infrastructure.AppUserRepository;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.ResourceHook;
import com.opesware.maintain.platform.security.PasswordHasher;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;

public final class IdentityHooks {
    private IdentityHooks() {}

    @Component
    public static class UserHook implements ResourceHook {
        private final AppUserRepository users;

        public UserHook(AppUserRepository users) { this.users = users; }

        @Override
        public String path() { return "users"; }

        @Override
        public void beforeCreate(Object e) {
            AppUser u = (AppUser) e;
            u.email = u.email.trim().toLowerCase();
            if (users.findAll().stream().anyMatch(x -> u.email.equalsIgnoreCase(x.email))) {
                throw ApiException.conflict("EMAIL_IN_USE", "A user with this email already exists");
            }
            if (u.status == null) u.status = "ACTIVE";
            if (u.mfaEnabled == null) u.mfaEnabled = !"TECHNICIAN".equals(u.role);
            if ("CUSTOMER".equals(u.role) && u.customerId == null) throw ApiException.invalid("Customer users must be linked to a customer");
            // A random initial secret; administrators set a real password via :set-password.
            u.passwordHash = PasswordHasher.hash(UUID.randomUUID().toString());
        }

        @Override
        public void beforeUpdate(Object e) {
            AppUser u = (AppUser) e;
            if ("CUSTOMER".equals(u.role) && u.customerId == null) throw ApiException.invalid("Customer users must be linked to a customer");
        }
    }

    @Component
    public static class DelegationHook implements ResourceHook {
        @Override
        public String path() { return "delegations"; }

        @Override
        public void beforeCreate(Object e) {
            Delegation d = (Delegation) e;
            if (Objects.equals(d.delegatorId, d.delegateId)) throw ApiException.invalid("A user cannot delegate to themselves");
            if (d.validTo != null && d.validFrom != null && !d.validTo.isAfter(d.validFrom)) throw ApiException.invalid("Validity end must be after start");
            if (d.status == null) d.status = "ACTIVE";
        }
    }
}
