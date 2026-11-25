package com.opesware.maintain.platform.application;

import com.opesware.maintain.platform.security.CurrentUser;
import com.opesware.maintain.platform.security.Principal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Central policy decisions shared by REST, jobs, reports, exports, search and sync (spec §2.3 rule 9, §11.1).
 * Reads are need-to-know: a role reads a resource when it is open to all staff, when the role is listed as a
 * reader, or when the role may modify it. Tenant, customer and site scope are enforced separately and always.
 */
public final class Access {
    /** Resources a customer-portal user may read, always filtered by their customer id. */
    public static final Set<String> CUSTOMER_READABLE = Set.of("assets", "maintenance-requests", "work-orders",
            "service-contracts", "quotes", "service-signoffs", "billing-exports");
    public static final Set<String> CUSTOMER_CREATABLE = Set.of("maintenance-requests", "service-signoffs");

    private static final Set<String> COMMERCIAL = Set.of("MANAGER", "COMMERCIAL", "AUDITOR");
    private static final Set<String> CUSTOMER_FACING = Set.of("MANAGER", "COMMERCIAL", "AUDITOR", "PLANNER", "DISPATCHER", "TECHNICIAN");
    private static final Set<String> PROCUREMENT = Set.of("MANAGER", "PROCUREMENT", "STOREKEEPER", "AUDITOR");
    private static final Set<String> GOVERNANCE = Set.of("MANAGER", "AUDITOR");

    /**
     * Need-to-know readers per resource (ADMIN always reads; writers of a resource also read it).
     * Resources not listed here are operational and open to all internal staff.
     */
    public static final Map<String, Set<String>> READERS = Map.ofEntries(
            // Commercial: prices, contracts and invoices.
            Map.entry("quotes", COMMERCIAL), Map.entry("billing-exports", COMMERCIAL), Map.entry("service-contracts", COMMERCIAL),
            Map.entry("service-grants", COMMERCIAL),
            // Customer master data and SLA targets — needed to schedule and execute customer work.
            Map.entry("customers", CUSTOMER_FACING), Map.entry("sla-policies", CUSTOMER_FACING),
            // Purchasing: suppliers and purchase prices.
            Map.entry("vendors", PROCUREMENT), Map.entry("purchase-requisitions", PROCUREMENT), Map.entry("purchase-orders", PROCUREMENT),
            // Governance and administration.
            Map.entry("audit-events", GOVERNANCE), Map.entry("users", GOVERNANCE), Map.entry("delegations", GOVERNANCE),
            Map.entry("devices", GOVERNANCE), Map.entry("settings", GOVERNANCE), Map.entry("outbox-events", GOVERNANCE),
            Map.entry("integrations", GOVERNANCE), Map.entry("webhook-subscriptions", GOVERNANCE), Map.entry("notifications", GOVERNANCE));

    /** Application pages (outside the generic module screens) and the roles that see them. */
    public static final Map<String, Set<String>> PAGES = pages();

    private static Map<String, Set<String>> pages() {
        Map<String, Set<String>> m = new LinkedHashMap<>();
        Set<String> staff = Set.of("ADMIN", "MANAGER", "PLANNER", "DISPATCHER", "TECHNICIAN", "STOREKEEPER", "SAFETY_OFFICER",
                "CALIBRATION_OFFICER", "COMMERCIAL", "PROCUREMENT", "AUDITOR");
        m.put("/dashboard", staff);
        m.put("/work-board", Set.of("ADMIN", "MANAGER", "PLANNER", "DISPATCHER", "TECHNICIAN", "SAFETY_OFFICER", "AUDITOR"));
        m.put("/dispatch", Set.of("ADMIN", "MANAGER", "PLANNER", "DISPATCHER", "AUDITOR"));
        m.put("/pm-board", Set.of("ADMIN", "MANAGER", "PLANNER", "DISPATCHER", "AUDITOR"));
        m.put("/stock", Set.of("ADMIN", "MANAGER", "PLANNER", "STOREKEEPER", "PROCUREMENT", "AUDITOR"));
        m.put("/analytics", Set.of("ADMIN", "MANAGER", "PLANNER", "AUDITOR"));
        m.put("/reports", Set.of("ADMIN", "MANAGER", "PLANNER", "COMMERCIAL", "AUDITOR"));
        m.put("/technician", Set.of("ADMIN", "MANAGER", "DISPATCHER", "TECHNICIAN"));
        m.put("/portal", Set.of("CUSTOMER"));
        m.put("/onboarding", Set.of("ADMIN", "MANAGER"));
        return Map.copyOf(m);
    }

    private Access() {}

    /** Whether the principal may open records of this resource (lists, details, search, exports). */
    public static boolean mayRead(Principal p, ResourceDef def) {
        if (p.is("CUSTOMER")) return CUSTOMER_READABLE.contains(def.path());
        if (p.is("ADMIN")) return true;
        Set<String> readers = READERS.get(def.path());
        return readers == null || readers.contains(p.role()) || (!def.readonly() && def.writerRoles().contains(p.role()));
    }

    public static boolean mayOpenPage(Principal p, String page) {
        Set<String> roles = PAGES.get(page);
        return roles != null && roles.contains(p.role());
    }

    public static List<String> pagesFor(Principal p) {
        return PAGES.entrySet().stream().filter(e -> e.getValue().contains(p.role())).map(Map.Entry::getKey).toList();
    }

    public static Principal canRead(ResourceDef def) {
        Principal p = CurrentUser.require();
        if (p.is("CUSTOMER") && !CUSTOMER_READABLE.contains(def.path())) throw ApiException.forbidden("Not available in the customer portal");
        if (!mayRead(p, def)) throw ApiException.forbidden(def.label() + " is not available for your role");
        return p;
    }

    /**
     * Read check for records loaded by the system while running a command the user is already allowed to run
     * (e.g. a work order's contract to find its SLA). Tenant, customer and site scope still apply; the
     * need-to-know reader list does not, because the command performs its own role check.
     */
    public static Principal canReadForCommand(ResourceDef def) {
        Principal p = CurrentUser.require();
        if (p.is("CUSTOMER") && !CUSTOMER_READABLE.contains(def.path())) throw ApiException.forbidden("Not available in the customer portal");
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

    /** Pages that are not backed by a single resource (analytics, reports) are guarded with this. */
    public static Principal requirePage(String page) {
        Principal p = CurrentUser.require();
        if (p.is("ADMIN") || mayOpenPage(p, page)) return p;
        throw ApiException.forbidden("This page is not available for your role");
    }
}
