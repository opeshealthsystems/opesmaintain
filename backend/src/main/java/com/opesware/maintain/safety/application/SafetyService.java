package com.opesware.maintain.safety.application;

import com.opesware.maintain.maintenance.domain.WorkOrder;
import com.opesware.maintain.maintenance.infrastructure.WorkOrderRepository;
import com.opesware.maintain.platform.application.Access;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.application.ResourceHook;
import com.opesware.maintain.platform.security.CurrentUser;
import com.opesware.maintain.safety.domain.InspectionResult;
import com.opesware.maintain.safety.domain.InspectionTemplate;
import com.opesware.maintain.safety.domain.SafetyIncident;
import com.opesware.maintain.safety.domain.WorkPermit;
import com.opesware.maintain.asset.domain.Asset;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Permit-to-work (spec §6.7) and inspections (OM-M12). Permits never replace physical LOTO. */
@Service
public class SafetyService {
    private final CrudService crud;
    private final WorkOrderRepository workOrders;
    private final com.opesware.maintain.identity.application.DelegationService delegation;

    public SafetyService(CrudService crud, WorkOrderRepository workOrders, com.opesware.maintain.identity.application.DelegationService delegation) {
        this.delegation = delegation;
        this.crud = crud;
        this.workOrders = workOrders;
    }

    @Transactional
    public WorkPermit permit(UUID id, String action, Map<String, Object> body) {
        WorkPermit p = crud.load(WorkPermit.class, id);
        String from = p.status;
        String actor = CurrentUser.actorName();
        String reason = body == null || body.get("reason") == null ? null : body.get("reason").toString();
        Instant now = Instant.now();
        switch (action) {
            case "submit" -> {
                Access.requireRole("TECHNICIAN", "PLANNER", "MANAGER", "SAFETY_OFFICER");
                expect(p, "DRAFT");
                p.requestedBy = actor;
                p.status = "SUBMITTED";
            }
            case "verify" -> {
                Access.requireRole("SAFETY_OFFICER", "MANAGER");
                expect(p, "SUBMITTED");
                p.status = "VERIFIED";
            }
            case "issue" -> {
                delegation.requireRoleOrDelegation("ISSUE_PERMITS", "SAFETY_OFFICER");
                expect(p, "VERIFIED");
                if (Objects.equals(p.requestedBy, actor)) throw ApiException.guard("SEPARATION_OF_DUTIES", "The requester cannot issue their own permit");
                if (p.validTo.isBefore(now)) throw ApiException.guard("PERMIT_EXPIRED", "Validity window has already ended");
                p.issuedBy = actor;
                p.status = "ISSUED";
            }
            case "activate" -> {
                Access.requireRole("TECHNICIAN", "SAFETY_OFFICER", "MANAGER");
                expect(p, "ISSUED");
                String accepted = body == null || body.get("acceptedBy") == null ? actor : body.get("acceptedBy").toString();
                if (now.isBefore(p.validFrom) || now.isAfter(p.validTo)) throw ApiException.guard("OUTSIDE_VALIDITY", "Permit can be activated only within its validity window");
                p.acceptedBy = accepted;
                p.status = "ACTIVE";
            }
            case "suspend" -> {
                Access.requireRole("SAFETY_OFFICER", "MANAGER");
                expect(p, "ACTIVE");
                p.revokeReason = reason;
                p.status = "SUSPENDED";
                holdLinkedWork(p, "Permit " + p.number + " suspended");
            }
            case "resume" -> {
                Access.requireRole("SAFETY_OFFICER");
                expect(p, "SUSPENDED");
                if (now.isAfter(p.validTo)) throw ApiException.guard("PERMIT_EXPIRED", "Permit validity has ended; raise a new permit");
                p.status = "ACTIVE";
            }
            case "close" -> {
                Access.requireRole("SAFETY_OFFICER", "MANAGER", "TECHNICIAN");
                if (!Set.of("ISSUED", "ACTIVE", "SUSPENDED").contains(from)) throw bad(p);
                p.status = "CLOSED";
            }
            case "revoke" -> {
                Access.requireRole("SAFETY_OFFICER", "MANAGER");
                if (Set.of("CLOSED", "REVOKED", "EXPIRED").contains(from)) throw bad(p);
                if (reason == null || reason.isBlank()) throw ApiException.guard("REASON_REQUIRED", "A revocation reason is required");
                p.revokeReason = reason;
                p.status = "REVOKED";
                holdLinkedWork(p, "Permit " + p.number + " revoked: " + reason);
            }
            default -> throw ApiException.notFound("Action " + action);
        }
        String event = switch (action) {
            case "submit" -> "PermitSubmitted.v1";
            case "verify" -> "PermitVerified.v1";
            case "issue" -> "PermitApproved.v1";
            case "activate" -> "PermitActivated.v1";
            case "suspend" -> "PermitSuspended.v1";
            case "resume" -> "PermitResumed.v1";
            case "close" -> "PermitClosed.v1";
            default -> "PermitRevoked.v1";
        };
        return crud.saveDomain(p, action.toUpperCase(), event, Map.of("from", from, "to", p.status));
    }

    /** Revocation/suspension immediately holds in-progress permit-bound work. */
    private void holdLinkedWork(WorkPermit p, String reason) {
        List<WorkOrder> linked = workOrders.findByPermitId(p.id);
        for (WorkOrder wo : linked) {
            if (Set.of("DISPATCHED", "IN_PROGRESS").contains(wo.status)) {
                wo.previousStatus = wo.status;
                wo.status = "ON_HOLD";
                wo.holdReason = reason;
                crud.saveDomain(wo, "TRANSITION", "WorkOrderHeld.v1", Map.of("reason", reason));
            }
        }
    }

    @Transactional
    public int expirePermits(UUID tenantId) {
        int n = 0;
        Instant now = Instant.now();
        for (Object o : crud.repo(WorkPermit.class).findAll()) {
            WorkPermit p = (WorkPermit) o;
            if (!tenantId.equals(p.tenantId)) continue;
            if (Set.of("ISSUED", "ACTIVE", "SUSPENDED").contains(p.status) && p.validTo.isBefore(now)) {
                p.status = "EXPIRED";
                crud.saveDomain(p, "EXPIRE", "PermitExpired.v1", Map.of());
                n++;
            }
        }
        return n;
    }

    private static void expect(WorkPermit p, String s) {
        if (!s.equals(p.status)) throw bad(p);
    }

    private static ApiException bad(WorkPermit p) {
        return ApiException.guard("INVALID_TRANSITION", "Permit is " + p.status);
    }

    @Component
    public static class PermitHook implements ResourceHook {
        @Override
        public String path() { return "work-permits"; }

        @Override
        public void beforeCreate(Object e) {
            WorkPermit p = (WorkPermit) e;
            if (!p.validTo.isAfter(p.validFrom)) throw ApiException.invalid("Validity end must be after start");
            p.status = "DRAFT";
            p.requestedBy = CurrentUser.actorName();
        }

        @Override
        public void beforeUpdate(Object e) {
            WorkPermit p = (WorkPermit) e;
            if (!"DRAFT".equals(p.status)) throw ApiException.guard("RECORD_LOCKED", "Only draft permits can be edited");
        }
    }

    @Component
    public static class InspectionResultHook implements ResourceHook {
        private final CrudService crud;

        public InspectionResultHook(CrudService crud) { this.crud = crud; }

        @Override
        public String path() { return "inspection-results"; }

        @Override
        public void beforeCreate(Object e) {
            InspectionResult r = (InspectionResult) e;
            InspectionTemplate t = crud.load(InspectionTemplate.class, r.templateId);
            if (!"PUBLISHED".equals(t.status)) throw ApiException.guard("TEMPLATE_NOT_PUBLISHED", "Only published templates can be used");
            if (r.inspector == null) r.inspector = CurrentUser.actorName();
            if (r.answers != null && r.score == null) {
                long total = r.answers.lines().filter(l -> !l.isBlank()).count();
                long pass = r.answers.lines().filter(l -> l.toUpperCase().contains("PASS") || l.toUpperCase().endsWith("YES")).count();
                r.score = total == 0 ? null : (int) Math.round(100.0 * pass / total);
            }
        }

        @Override
        public void afterSave(Object e, boolean created) {
            InspectionResult r = (InspectionResult) e;
            if (!created || !"FAIL".equals(r.outcome)) return;
            Asset a = crud.load(Asset.class, r.assetId);
            WorkOrder wo = new WorkOrder();
            wo.title = "Inspection failure: " + a.name;
            wo.description = r.defectsFound == null ? "Defects found during inspection" : r.defectsFound;
            wo.workType = "CORRECTIVE";
            wo.priority = "HIGH";
            wo.assetId = a.id;
            wo.siteId = a.siteId;
            WorkOrder saved = crud.persistNew(wo);
            r.followUpWorkOrderId = saved.id;
            crud.saveDomain(r, "FOLLOW_UP", null, Map.of("workOrder", saved.number));
        }
    }

    @Component
    public static class IncidentHook implements ResourceHook {
        @Override
        public String path() { return "safety-incidents"; }

        @Override
        public void beforeCreate(Object e) {
            SafetyIncident i = (SafetyIncident) e;
            if (i.status == null) i.status = "OPEN";
            if (i.reportedBy == null) i.reportedBy = CurrentUser.actorName();
        }
    }
}
