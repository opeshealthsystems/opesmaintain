package com.opesware.maintain.platform.security;

import java.util.UUID;

/** Authenticated actor resolved server-side; client-supplied tenant ids never confer access. */
public record Principal(UUID userId, UUID tenantId, String email, String name, String role, UUID customerId) {

    public boolean is(String... roles) {
        for (String r : roles) if (r.equals(role)) return true;
        return false;
    }

    public boolean internal() {
        return !"CUSTOMER".equals(role);
    }
}
