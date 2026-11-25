package com.opesware.maintain.asset.application;

import com.opesware.maintain.asset.domain.Asset;
import com.opesware.maintain.asset.domain.AssetEvent;
import com.opesware.maintain.asset.domain.Meter;
import com.opesware.maintain.asset.domain.MeterReading;
import com.opesware.maintain.asset.domain.PassportToken;
import com.opesware.maintain.asset.infrastructure.AssetRepository;
import com.opesware.maintain.asset.infrastructure.PassportTokenRepository;
import com.opesware.maintain.maintenance.application.PmService;
import com.opesware.maintain.organization.domain.Site;
import com.opesware.maintain.platform.application.Access;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.AuditService;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.application.ResourceHook;
import com.opesware.maintain.platform.security.CurrentUser;
import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Asset lifecycle, safety dimension, transfers, passport tokens and meter acceptance (OM-M03/M05/M14). */
@Service
public class AssetService {
    public static final Set<String> STATUSES = Set.of("PROPOSED", "ACTIVE", "OUT_OF_SERVICE", "UNDER_MAINTENANCE", "QUARANTINED", "RETIRED", "DISPOSED");
    public static final Set<String> SAFETY = Set.of("CLEAR", "RESTRICTED", "LOCKED_OUT", "PERMIT_REQUIRED");
    private static final SecureRandom RANDOM = new SecureRandom();

    private final CrudService crud;
    private final AssetRepository assets;
    private final PassportTokenRepository tokens;
    private final AuditService audit;

    public AssetService(CrudService crud, AssetRepository assets, PassportTokenRepository tokens, AuditService audit) {
        this.crud = crud;
        this.assets = assets;
        this.tokens = tokens;
        this.audit = audit;
    }

    @Transactional
    public Asset changeStatus(UUID id, String status, String reason) {
        Access.requireRole("MANAGER", "PLANNER");
        if (!STATUSES.contains(status)) throw ApiException.invalid("Unknown asset status " + status);
        require(reason);
        Asset a = crud.load(Asset.class, id);
        if ("DISPOSED".equals(a.status)) throw ApiException.guard("ASSET_DISPOSED", "Disposed assets cannot change status");
        if ("ACTIVE".equals(status) && "LOCKED_OUT".equals(a.safetyState)) {
            throw ApiException.guard("SAFETY_LOCKOUT", "Clear the physical lockout (safety officer) before returning the asset to service");
        }
        String from = a.status;
        a.status = status;
        event(a, "STATUS_CHANGED", from, status, reason);
        return crud.saveDomain(a, "STATUS_CHANGE", "AssetStatusChanged.v1", Map.of("from", from, "to", status, "reason", reason));
    }

    @Transactional
    public Asset changeSafety(UUID id, String state, String reason) {
        Access.requireRole("SAFETY_OFFICER", "MANAGER");
        if (!SAFETY.contains(state)) throw ApiException.invalid("Unknown safety state " + state);
        require(reason);
        Asset a = crud.load(Asset.class, id);
        String from = a.safetyState;
        a.safetyState = state;
        event(a, "SAFETY_CHANGED", from, state, reason);
        return crud.saveDomain(a, "SAFETY_CHANGE", "AssetSafetyStateChanged.v1", Map.of("from", String.valueOf(from), "to", state, "reason", reason));
    }

    /** Moves an asset to another site keeping its identity and history (OM-M03-004, AT-M03). */
    @Transactional
    public Asset transfer(UUID id, UUID siteId, UUID locationId, String reason) {
        Access.requireRole("MANAGER");
        require(reason);
        Asset a = crud.load(Asset.class, id);
        Site target = crud.load(Site.class, siteId);
        String from = a.siteId == null ? "-" : crud.load(Site.class, a.siteId).name;
        a.siteId = target.id;
        a.locationId = locationId;
        event(a, "TRANSFERRED", from, target.name, reason);
        return crud.saveDomain(a, "TRANSFER", "AssetTransferred.v1", Map.of("from", from, "to", target.name));
    }

    @Transactional
    public Asset retire(UUID id, String reason, boolean dispose) {
        Access.requireRole("MANAGER");
        require(reason);
        Asset a = crud.load(Asset.class, id);
        String from = a.status;
        a.status = dispose ? "DISPOSED" : "RETIRED";
        event(a, dispose ? "DISPOSED" : "RETIRED", from, a.status, reason);
        for (PassportToken t : tokens.findByAssetId(a.id)) {
            if ("ACTIVE".equals(t.status)) {
                t.status = "REVOKED";
                t.revokedAt = Instant.now();
                crud.saveDomain(t, "REVOKE", "PassportTokenRevoked.v1", Map.of("reason", "asset retired"));
            }
        }
        return crud.saveDomain(a, dispose ? "DISPOSE" : "RETIRE", "AssetRetired.v1", Map.of("reason", reason));
    }

    @Transactional
    public PassportToken issueToken(UUID assetId) {
        Access.requireRole("MANAGER", "PLANNER");
        Asset a = crud.load(Asset.class, assetId);
        for (PassportToken t : tokens.findByAssetId(a.id)) {
            if ("ACTIVE".equals(t.status)) {
                t.status = "REVOKED";
                t.revokedAt = Instant.now();
                crud.saveDomain(t, "ROTATE", "PassportTokenRevoked.v1", Map.of("reason", "rotated"));
            }
        }
        byte[] b = new byte[18];
        RANDOM.nextBytes(b);
        PassportToken t = new PassportToken();
        t.assetId = a.id;
        t.token = Base64.getUrlEncoder().withoutPadding().encodeToString(b);
        t.status = "ACTIVE";
        t.issuedAt = Instant.now();
        t.scanCount = 0;
        return crud.persistNew(t);
    }

    @Transactional
    public PassportToken revokeToken(UUID tokenId) {
        Access.requireRole("MANAGER", "PLANNER");
        PassportToken t = crud.load(PassportToken.class, tokenId);
        t.status = "REVOKED";
        t.revokedAt = Instant.now();
        return crud.saveDomain(t, "REVOKE", "PassportTokenRevoked.v1", Map.of());
    }

    /** Public scan: reveals only that a valid token exists, never protected data (OM-M05-001). */
    @Transactional(readOnly = true)
    public Map<String, Object> publicScan(String token) {
        PassportToken t = tokens.findFirstByToken(token).orElse(null);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("valid", t != null && "ACTIVE".equals(t.status));
        m.put("message", m.get("valid").equals(true) ? "Sign in to view this equipment passport." : "This QR code is not valid.");
        return m;
    }

    /** Authenticated scan: resolves the token within the caller's tenant and audits the access. */
    @Transactional
    public UUID resolveToken(String token) {
        UUID tenant = CurrentUser.requireTenant();
        PassportToken t = tokens.findFirstByToken(token).filter(x -> tenant.equals(x.tenantId)).orElse(null);
        if (t == null || !"ACTIVE".equals(t.status)) {
            throw ApiException.notFound("Passport");
        }
        crud.load(Asset.class, t.assetId);
        t.scanCount = (t.scanCount == null ? 0 : t.scanCount) + 1;
        crud.saveDomain(t, "PASSPORT_SCAN", null, Map.of("asset", t.assetId.toString()));
        return t.assetId;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> tree(UUID rootId) {
        Asset root = crud.load(Asset.class, rootId);
        List<Map<String, Object>> out = new java.util.ArrayList<>();
        walk(root, 0, out, new HashSet<>());
        return out;
    }

    private void walk(Asset a, int depth, List<Map<String, Object>> out, Set<UUID> seen) {
        if (!seen.add(a.id) || depth > 12) return;
        out.add(Map.of("id", a.id.toString(), "tag", a.tag, "name", a.name, "status", a.status, "depth", depth));
        for (Asset c : assets.findByParentId(a.id)) walk(c, depth + 1, out, seen);
    }

    void event(Asset a, String type, String from, String to, String reason) {
        AssetEvent e = new AssetEvent();
        e.assetId = a.id;
        e.eventType = type;
        e.fromValue = from;
        e.toValue = to;
        e.reason = reason;
        e.effectiveAt = Instant.now();
        e.actor = CurrentUser.actorName();
        crud.persistNew(e);
    }

    private static void require(String reason) {
        if (reason == null || reason.isBlank()) throw ApiException.guard("REASON_REQUIRED", "A reason is required");
    }

    @Component
    public static class AssetHook implements ResourceHook {
        private final AssetService service;
        private final AssetRepository assets;

        public AssetHook(AssetService service, AssetRepository assets) {
            this.service = service;
            this.assets = assets;
        }

        @Override
        public String path() { return "assets"; }

        @Override
        public void beforeCreate(Object e) {
            Asset a = (Asset) e;
            if (a.status == null) a.status = "ACTIVE";
            if (a.safetyState == null) a.safetyState = "CLEAR";
            checkCycle(a);
        }

        @Override
        public void beforeUpdate(Object e) {
            checkCycle((Asset) e);
        }

        @Override
        public void afterSave(Object e, boolean created) {
            if (created) {
                Asset a = (Asset) e;
                service.event(a, "REGISTERED", null, a.status, "Asset registered");
            }
        }

        /** OM-M03-002: hierarchy without cycles. */
        private void checkCycle(Asset a) {
            UUID cursor = a.parentId;
            int depth = 0;
            while (cursor != null) {
                if (Objects.equals(cursor, a.id)) throw ApiException.guard("HIERARCHY_CYCLE", "An asset cannot be its own ancestor");
                if (++depth > 50) throw ApiException.guard("HIERARCHY_DEPTH", "Hierarchy too deep");
                cursor = assets.findById(cursor).map(p -> p.parentId).orElse(null);
            }
        }
    }

    /** Meter acceptance: cumulative meters cannot run backwards; accepted readings may trigger PM. */
    @Component
    public static class MeterReadingHook implements ResourceHook {
        private final CrudService crud;
        private final PmService pm;

        public MeterReadingHook(CrudService crud, PmService pm) {
            this.crud = crud;
            this.pm = pm;
        }

        @Override
        public String path() { return "meter-readings"; }

        @Override
        public void beforeCreate(Object e) {
            MeterReading r = (MeterReading) e;
            Meter m = crud.load(Meter.class, r.meterId);
            r.assetId = m.assetId;
            if (r.source == null) r.source = "MANUAL";
            r.accepted = true;
            if ("CUMULATIVE".equals(m.meterType) && m.lastReading != null && r.value.compareTo(m.lastReading) < 0) {
                r.accepted = false;
                r.rejectionReason = "Lower than last cumulative reading " + m.lastReading.stripTrailingZeros().toPlainString() + " (record a meter reset instead)";
            } else if (m.maxValue != null && r.value.compareTo(m.maxValue) > 0) {
                r.accepted = false;
                r.rejectionReason = "Above configured maximum";
            } else if (m.minValue != null && r.value.compareTo(m.minValue) < 0) {
                r.accepted = false;
                r.rejectionReason = "Below configured minimum";
            }
        }

        @Override
        public void afterSave(Object e, boolean created) {
            MeterReading r = (MeterReading) e;
            if (!created || !Boolean.TRUE.equals(r.accepted)) return;
            Meter m = crud.load(Meter.class, r.meterId);
            if (m.lastReadingAt == null || !r.readingAt.isBefore(m.lastReadingAt)) {
                m.lastReading = r.value;
                m.lastReadingAt = r.readingAt;
                crud.saveDomain(m, "METER_UPDATED", null, Map.of("value", r.value.toPlainString()));
            }
            pm.onMeterReading(m.id, r.value);
        }
    }

    public static BigDecimal zero() { return BigDecimal.ZERO; }
}
