package com.opesware.maintain.platform.security;

import com.opesware.maintain.platform.application.ApiException;
import java.util.UUID;
import java.util.function.Supplier;

public final class CurrentUser {
    private static final ThreadLocal<Principal> HOLDER = new ThreadLocal<>();
    private static final ThreadLocal<AccessScope> SCOPE = new ThreadLocal<>();

    /** Grant-derived scope for service-provider users; null when unrestricted. */
    public static AccessScope scope() { return SCOPE.get(); }

    public static void setScope(AccessScope s) { if (s == null) SCOPE.remove(); else SCOPE.set(s); }

    private CurrentUser() {}

    public static void set(Principal p) { HOLDER.set(p); }

    public static void clear() {
        HOLDER.remove();
        SCOPE.remove();
    }

    public static Principal get() { return HOLDER.get(); }

    public static Principal require() {
        Principal p = HOLDER.get();
        if (p == null) throw ApiException.unauthorized();
        return p;
    }

    public static UUID requireTenant() {
        Principal p = HOLDER.get();
        if (p == null || p.tenantId() == null) throw new IllegalStateException("No tenant context");
        return p.tenantId();
    }

    public static String actorName() {
        Principal p = HOLDER.get();
        return p == null ? "system" : p.name();
    }

    /** Runs background work for a tenant as the system actor. */
    public static <T> T runAsSystem(UUID tenantId, Supplier<T> work) {
        Principal previous = HOLDER.get();
        AccessScope previousScope = SCOPE.get();
        SCOPE.remove();
        HOLDER.set(new Principal(null, tenantId, "system@opes", "system", "ADMIN", null));
        try {
            return work.get();
        } finally {
            if (previous == null) HOLDER.remove(); else HOLDER.set(previous);
            setScope(previousScope);
        }
    }
}
