package com.opesware.maintain.platform.security;

import java.util.Set;
import java.util.UUID;

/**
 * Record-level scope for users of a service-provider organization, derived from their active
 * service grants (OM-M01-003, OM-M03-005, AT-M01). {@code null} scope means unrestricted.
 */
public record AccessScope(Set<UUID> sites, Set<UUID> assets) {
    public boolean allowsSite(UUID site) {
        return site != null && sites.contains(site);
    }

    public boolean allowsAsset(UUID asset) {
        return asset != null && assets.contains(asset);
    }
}
