package com.opesware.maintain.platform.api;

import com.opesware.maintain.identity.domain.Device;
import com.opesware.maintain.maintenance.application.WorkOrderService;
import com.opesware.maintain.maintenance.domain.WorkOrder;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.domain.SyncOperation;
import com.opesware.maintain.platform.infrastructure.SyncOperationRepo;
import com.opesware.maintain.platform.security.CurrentUser;
import com.opesware.maintain.platform.security.Principal;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Offline-first sync (spec §10). The server stays authoritative: every queued operation is
 * re-authorized and re-validated online, applied in its own transaction, and receipted idempotently
 * by client operation id. Permit-bound starts always require online review.
 */
@RestController
@RequestMapping("/api/v1/mobile/sync")
public class SyncController {
    private final CrudService crud;
    private final WorkOrderService workOrders;
    private final SyncOperationRepo receipts;
    private final TransactionTemplate tx;
    private final EntityManager em;
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private io.micrometer.core.instrument.MeterRegistry metrics;

    public SyncController(CrudService crud, WorkOrderService workOrders, SyncOperationRepo receipts,
                          PlatformTransactionManager tm, EntityManager em) {
        this.crud = crud;
        this.workOrders = workOrders;
        this.receipts = receipts;
        this.tx = new TransactionTemplate(tm);
        this.em = em;
    }

    @PostMapping("/operations")
    @SuppressWarnings("unchecked")
    public Map<String, Object> push(@RequestBody Map<String, Object> body) {
        Principal p = CurrentUser.require();
        String deviceId = body.get("deviceId") == null ? null : body.get("deviceId").toString();
        if (deviceId != null) checkDevice(p, deviceId);
        List<Map<String, Object>> ops = (List<Map<String, Object>>) body.getOrDefault("operations", List.of());
        List<Map<String, Object>> results = new ArrayList<>();
        for (Map<String, Object> op : ops) results.add(apply(p, deviceId, op));
        return Map.of("serverTime", Instant.now().toString(), "results", results);
    }

    @GetMapping("/changes")
    public Map<String, Object> changes(@RequestParam(required = false) String since) {
        Principal p = CurrentUser.require();
        Instant from = since == null ? Instant.EPOCH : Instant.parse(since);
        Map<String, String> params = new HashMap<>();
        params.put("updatedAtFrom", from.toString());
        params.put("size", "200");
        List<Object> wos = new ArrayList<>(crud.findAll("work-orders", Map.of("size", "200"), 200));
        wos.removeIf(w -> ((WorkOrder) w).updatedAt.isBefore(from));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("serverTime", Instant.now().toString());
        out.put("workOrders", crud.toMaps(crud.def("work-orders"), wos));
        out.put("receipts", receipts.findTop50ByTenantIdAndActorOrderByReceivedAtDesc(p.tenantId(), p.name()));
        return out;
    }

    private void checkDevice(Principal p, String deviceId) {
        List<Device> devices = em.createQuery("select d from Device d where d.tenantId = :t and d.name = :n", Device.class)
                .setParameter("t", p.tenantId()).setParameter("n", deviceId).getResultList();
        if (devices.stream().anyMatch(d -> "REVOKED".equals(d.status))) {
            throw ApiException.forbidden("This device has been revoked; local queued data cannot be synchronized");
        }
        Device mine = devices.stream().filter(d -> p.userId() != null && p.userId().equals(d.userId)).findFirst().orElse(null);
        if (devices.stream().anyMatch(d -> p.userId() != null && !p.userId().equals(d.userId))) {
            throw ApiException.forbidden("This device is registered to another user");
        }
        if (mine == null && p.userId() != null) {
            // first sync registers the device so it can be listed and revoked by administrators
            Device d = new Device();
            d.userId = p.userId();
            d.name = deviceId;
            d.platform = deviceId.startsWith("MOB-") ? "ANDROID" : "WEB";
            d.status = "TRUSTED";
            mine = crud.persistNew(d);
        }
        if (mine != null) {
            mine.lastSyncAt = Instant.now();
            em.merge(mine);
        }
    }

    private Map<String, Object> apply(Principal p, String deviceId, Map<String, Object> op) {
        String opId = str(op.get("clientOperationId"));
        String type = str(op.get("type"));
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("clientOperationId", opId);
        if (opId == null || type == null) {
            r.put("outcome", "REJECTED");
            r.put("message", "clientOperationId and type are required");
            return r;
        }
        SyncOperation prior = receipts.findByTenantIdAndClientOperationId(p.tenantId(), opId).orElse(null);
        if (prior != null) {
            r.put("outcome", prior.outcome);
            r.put("message", prior.message);
            r.put("replayed", true);
            return r;
        }
        String outcome;
        String message;
        UUID resultId = null;
        try {
            resultId = tx.execute(s -> execute(type, op));
            outcome = "ACCEPTED";
            message = "Applied";
        } catch (ApiException e) {
            outcome = switch (e.status()) {
                case 409, 412, 428 -> "CONFLICT";
                default -> e.code().startsWith("PERMIT") ? "REQUIRES_ONLINE_REVIEW" : "REJECTED";
            };
            message = e.getMessage();
        } catch (RuntimeException e) {
            outcome = "REJECTED";
            message = "Operation could not be applied";
        }
        final String fOutcome = outcome;
        final String fMessage = message;
        final UUID fResult = resultId;
        tx.executeWithoutResult(s -> {
            SyncOperation rec = new SyncOperation();
            rec.id = UUID.randomUUID();
            rec.tenantId = p.tenantId();
            rec.clientOperationId = opId;
            rec.deviceId = deviceId;
            rec.actor = p.name();
            rec.operationType = type;
            rec.outcome = fOutcome;
            rec.message = fMessage;
            rec.resultId = fResult;
            rec.receivedAt = Instant.now();
            receipts.save(rec);
        });
        r.put("outcome", outcome);
        r.put("message", message);
        if (metrics != null) metrics.counter("opes_sync_operations_total", "outcome", outcome, "type", type).increment();
        return r;
    }

    @SuppressWarnings("unchecked")
    private UUID execute(String type, Map<String, Object> op) {
        Map<String, Object> payload = (Map<String, Object>) op.getOrDefault("payload", Map.of());
        String opId = str(op.get("clientOperationId"));
        return switch (type) {
            case "TASK_RECORD" -> workOrders.recordTask(uuid(payload.get("workOrderId")), uuid(payload.get("taskId")), payload).id;
            case "WO_TRANSITION" -> {
                Map<String, Object> b = new HashMap<>(payload);
                b.put("version", op.get("baseVersion"));
                yield workOrders.transition(uuid(payload.get("workOrderId")), str(payload.get("to")), null, b).id;
            }
            case "METER_READING", "TIME_ENTRY" -> {
                String path = "METER_READING".equals(type) ? "meter-readings" : "time-entries";
                Map<String, Object> b = new HashMap<>(payload);
                if ("METER_READING".equals(type)) b.putIfAbsent("source", "MOBILE");
                yield UUID.fromString(crud.create(path, b, "sync:" + opId).get("id").toString());
            }
            default -> throw ApiException.invalid("Unsupported operation type " + type);
        };
    }

    private static String str(Object o) {
        return o == null || o.toString().isBlank() ? null : o.toString();
    }

    private static UUID uuid(Object o) {
        if (o == null) throw ApiException.invalid("Missing identifier");
        return UUID.fromString(o.toString());
    }
}
