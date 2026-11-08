package com.opesware.maintain.maintenance.application;

import com.opesware.maintain.maintenance.domain.MaintenanceRequest;
import com.opesware.maintain.maintenance.domain.WorkOrder;
import com.opesware.maintain.platform.application.Access;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.CrudService;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Request model (spec §6.3): SUBMITTED → ACKNOWLEDGED → TRIAGED → CONVERTED | REJECTED | DUPLICATE_LINKED. */
@Service
public class RequestService {
    private static final String[] ROLES = {"MANAGER", "DISPATCHER", "PLANNER"};
    private final CrudService crud;

    public RequestService(CrudService crud) {
        this.crud = crud;
    }

    @Transactional
    public MaintenanceRequest acknowledge(UUID id) {
        Access.requireRole(ROLES);
        MaintenanceRequest r = crud.load(MaintenanceRequest.class, id);
        expect(r, "SUBMITTED");
        r.status = "ACKNOWLEDGED";
        r.acknowledgedAt = Instant.now();
        return crud.saveDomain(r, "ACKNOWLEDGE", "MaintenanceRequestAcknowledged.v1", Map.of("number", r.number));
    }

    @Transactional
    public MaintenanceRequest triage(UUID id, Map<String, Object> body) {
        Access.requireRole(ROLES);
        MaintenanceRequest r = crud.load(MaintenanceRequest.class, id);
        if (!Set.of("SUBMITTED", "ACKNOWLEDGED").contains(r.status)) throw bad(r);
        if (r.acknowledgedAt == null) r.acknowledgedAt = Instant.now();
        String priority = WorkOrderService.str(body, "priority");
        if (priority != null) r.priority = priority;
        r.triageNote = WorkOrderService.str(body, "note");
        r.status = "TRIAGED";
        return crud.saveDomain(r, "TRIAGE", "MaintenanceRequestTriaged.v1", Map.of("priority", r.priority));
    }

    @Transactional
    public MaintenanceRequest reject(UUID id, Map<String, Object> body) {
        Access.requireRole(ROLES);
        MaintenanceRequest r = crud.load(MaintenanceRequest.class, id);
        if (!Set.of("SUBMITTED", "ACKNOWLEDGED", "TRIAGED").contains(r.status)) throw bad(r);
        String reason = WorkOrderService.str(body, "reason");
        WorkOrderService.require(reason, "A rejection reason is required");
        r.triageNote = reason;
        r.status = "REJECTED";
        return crud.saveDomain(r, "REJECT", "MaintenanceRequestRejected.v1", Map.of("reason", reason));
    }

    @Transactional
    public MaintenanceRequest linkDuplicate(UUID id, UUID originalId) {
        Access.requireRole(ROLES);
        MaintenanceRequest r = crud.load(MaintenanceRequest.class, id);
        MaintenanceRequest original = crud.load(MaintenanceRequest.class, originalId);
        if (r.id.equals(original.id)) throw ApiException.invalid("A request cannot duplicate itself");
        if (!Set.of("SUBMITTED", "ACKNOWLEDGED", "TRIAGED").contains(r.status)) throw bad(r);
        r.duplicateOfId = original.id;
        r.workOrderId = original.workOrderId;
        r.status = "DUPLICATE_LINKED";
        return crud.saveDomain(r, "LINK_DUPLICATE", "MaintenanceRequestDuplicateLinked.v1", Map.of("original", original.number));
    }

    /** Idempotent: converting again returns the already-created work order. */
    @Transactional
    public WorkOrder convert(UUID id, Map<String, Object> body) {
        Access.requireRole(ROLES);
        MaintenanceRequest r = crud.load(MaintenanceRequest.class, id);
        if (r.workOrderId != null) return crud.load(WorkOrder.class, r.workOrderId);
        if (!Set.of("ACKNOWLEDGED", "TRIAGED", "SUBMITTED").contains(r.status)) throw bad(r);
        WorkOrder wo = new WorkOrder();
        wo.title = r.title;
        wo.description = r.description;
        wo.priority = r.priority;
        wo.workType = "SAFETY".equals(r.category) || "CRITICAL".equals(r.priority) ? "EMERGENCY" : "CORRECTIVE";
        String type = WorkOrderService.str(body, "workType");
        if (type != null) wo.workType = type;
        wo.assetId = r.assetId;
        wo.siteId = r.siteId;
        wo.locationId = r.locationId;
        wo.customerId = r.customerId;
        wo.requestId = r.id;
        WorkOrder saved = crud.persistNew(wo);
        if (r.acknowledgedAt == null) r.acknowledgedAt = Instant.now();
        r.workOrderId = saved.id;
        r.status = "CONVERTED";
        crud.saveDomain(r, "CONVERT", "MaintenanceRequestConverted.v1", Map.of("workOrder", saved.number));
        return saved;
    }

    private static void expect(MaintenanceRequest r, String status) {
        if (!status.equals(r.status)) throw bad(r);
    }

    private static ApiException bad(MaintenanceRequest r) {
        return ApiException.guard("INVALID_TRANSITION", "Request is " + r.status);
    }
}
