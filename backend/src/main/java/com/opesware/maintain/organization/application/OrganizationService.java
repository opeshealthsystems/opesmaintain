package com.opesware.maintain.organization.application;

import com.opesware.maintain.asset.infrastructure.AssetRepository;
import com.opesware.maintain.organization.domain.Location;
import com.opesware.maintain.organization.domain.ServiceGrant;
import com.opesware.maintain.organization.domain.Site;
import com.opesware.maintain.platform.application.Access;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.application.ResourceHook;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Service grants (OM-M01-003) and location integrity rules (OM-M04-003). */
@Service
public class OrganizationService {
    private final CrudService crud;

    public OrganizationService(CrudService crud) {
        this.crud = crud;
    }

    @Transactional
    public ServiceGrant revoke(UUID id, String reason) {
        Access.requireRole("MANAGER");
        if (reason == null || reason.isBlank()) throw ApiException.guard("REASON_REQUIRED", "A revocation reason is required");
        ServiceGrant g = crud.load(ServiceGrant.class, id);
        if (!"ACTIVE".equals(g.status)) throw ApiException.guard("INVALID_TRANSITION", "Grant is " + g.status);
        g.status = "REVOKED";
        g.revokedReason = reason;
        return crud.saveDomain(g, "REVOKE", "ServiceGrantRevoked.v1", Map.of("reason", reason));
    }

    /** True when a grant is active today — expired grants block new access (AT-M01). */
    public static boolean isEffective(ServiceGrant g, LocalDate today) {
        return "ACTIVE".equals(g.status) && !today.isBefore(g.validFrom) && !today.isAfter(g.validTo);
    }

    @Component
    public static class GrantHook implements ResourceHook {
        @Override
        public String path() { return "service-grants"; }

        @Override
        public void beforeCreate(Object e) {
            ServiceGrant g = (ServiceGrant) e;
            if (g.providerOrgId.equals(g.clientOrgId)) throw ApiException.invalid("Provider and client must differ");
            if (g.validTo.isBefore(g.validFrom)) throw ApiException.invalid("Grant end date must be on or after its start");
            g.status = g.validTo.isBefore(LocalDate.now()) ? "EXPIRED" : "ACTIVE";
        }
    }

    @Component
    public static class SiteHook implements ResourceHook {
        @Override
        public String path() { return "sites"; }

        @Override
        public void beforeCreate(Object e) { check((Site) e); }

        @Override
        public void beforeUpdate(Object e) { check((Site) e); }

        private void check(Site s) {
            try {
                ZoneId.of(s.timeZone);
            } catch (RuntimeException ex) {
                throw ApiException.invalid("Time zone must be an IANA zone such as Africa/Douala");
            }
            if (s.status == null) s.status = "ACTIVE";
            if (s.locationTrackingEnabled == null) s.locationTrackingEnabled = true;
        }
    }

    @Component
    public static class LocationHook implements ResourceHook {
        private final AssetRepository assets;

        public LocationHook(AssetRepository assets) { this.assets = assets; }

        @Override
        public String path() { return "locations"; }

        @Override
        public void beforeCreate(Object e) {
            Location l = (Location) e;
            if (l.status == null) l.status = "ACTIVE";
        }

        @Override
        public void beforeUpdate(Object e) {
            Location l = (Location) e;
            if ("INACTIVE".equals(l.status)) {
                long live = assets.findByLocationId(l.id).stream()
                        .filter(a -> !"RETIRED".equals(a.status) && !"DISPOSED".equals(a.status)).count();
                if (live > 0) throw ApiException.guard("LOCATION_IN_USE", live + " live asset(s) must be reassigned before deactivating this location");
            }
        }
    }
}
