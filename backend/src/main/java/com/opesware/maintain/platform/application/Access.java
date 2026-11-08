package com.opesware.maintain.platform.application;

import com.opesware.maintain.platform.security.CurrentUser;
import com.opesware.maintain.platform.security.Principal;
import java.util.Set;

/** Central policy decisions shared by REST, jobs, reports, exports and sync (spec §2.3 rule 9). */
public final class Access {
    /** Resources a customer-portal user may read, always filtered by their customer id. */
    public static final Set<String> CUSTOMER_READABLE = Set.of("assets", "maintenance-requests", "work-orders",
            "service-contracts", "quotes", "service-signoffs", "billing-exports");
    public static final Set<String> CUSTOMER_CREATABLE = Set.of("maintenance-requests", "service-signoffs");
    /** Sensitive administrative resources limited to managers/auditors. */
    private static final Set<String> RESTRICTED_READ = Set.of("audit-events", "users", "delegations", "devices",
            "settings", "outbox-events", "integrations", "webhook-subscriptions", "notifications");

    private Access() {}

    public static Principal canRead(ResourceDef def) {
        Principal p = CurrentUser.require();
        if (p.is("CUSTOMER")) {
            if (!CUSTOMER_READABLE.contains(def.path())) throw ApiException.forbidden("Not available in the customer portal");
            return p;
        }
        if (RESTRICTED_READ.contains(def.path()) && !p.is("ADMIN", "MANAGER", "AUDITOR")) {
            throw ApiException.forbidden("Requires administrator, manager or auditor role");
        }
        return p;
    }

    public static Principal canWrite(ResourceDef def) {
        Principal p = CurrentUser.require();
        if (def.readonly()) throw ApiException.forbidden(def.label() + " is read-only; use the domain commands");
        if (p.is("CUSTOMER")) {
            if (!CUSTOMER_CREATABLE.contains(def.path())) throw ApiException.forbidden("Not permitted for customer users");
            return p;
        }
        if (p.is("AUDITOR")) throw ApiException.forbidden("Auditors have read-only access");
        if (!def.writerRoles().contains(p.role())) {
            throw ApiException.forbidden("Role " + p.role() + " may not modify " + def.label());
        }
        return p;
    }

    public static Principal requireRole(String... roles) {
        Principal p = CurrentUser.require();
        if (p.is("ADMIN") || p.is(roles)) return p;
        throw ApiException.forbidden("Requires one of roles: " + String.join(", ", roles));
    }
}
