package com.opesware.maintain.maintenance.application;

import com.opesware.maintain.asset.domain.Asset;
import com.opesware.maintain.inventory.application.InventoryService;
import com.opesware.maintain.maintenance.domain.PmOccurrence;
import com.opesware.maintain.maintenance.domain.WorkOrder;
import com.opesware.maintain.maintenance.domain.WorkTask;
import com.opesware.maintain.maintenance.infrastructure.PmOccurrenceRepository;
import com.opesware.maintain.maintenance.infrastructure.WorkTaskRepository;
import com.opesware.maintain.platform.application.Access;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.Clock;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.security.CurrentUser;
import com.opesware.maintain.platform.security.Principal;
import com.opesware.maintain.safety.domain.WorkPermit;
import com.opesware.maintain.workforce.domain.TimeEntry;
import com.opesware.maintain.workforce.infrastructure.TimeEntryRepository;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Guarded work-order lifecycle (spec §6.1) with invariants WO-INV-01..08. */
@Service
public class WorkOrderService {

    public record Rule(String to, Set<String> roles) {}

    public static final List<String> ACTIVE = List.of("DRAFT", "TRIAGED", "APPROVED", "PLANNED", "DISPATCHED", "IN_PROGRESS");

    private static final Map<String, List<Rule>> RULES = new LinkedHashMap<>();

    static {
        RULES.put("DRAFT", List.of(new Rule("TRIAGED", Set.of("DISPATCHER", "MANAGER", "PLANNER"))));
        RULES.put("TRIAGED", List.of(new Rule("APPROVED", Set.of("MANAGER"))));
        RULES.put("APPROVED", List.of(new Rule("PLANNED", Set.of("PLANNER", "MANAGER"))));
        RULES.put("PLANNED", List.of(new Rule("DISPATCHED", Set.of("DISPATCHER", "MANAGER", "PLANNER"))));
        RULES.put("DISPATCHED", List.of(new Rule("IN_PROGRESS", Set.of("TECHNICIAN", "MANAGER"))));
        RULES.put("IN_PROGRESS", List.of(new Rule("WORK_COMPLETED", Set.of("TECHNICIAN", "MANAGER"))));
        RULES.put("WORK_COMPLETED", List.of(new Rule("REVIEWED", Set.of("MANAGER", "PLANNER"))));
        RULES.put("REVIEWED", List.of(new Rule("CLOSED", Set.of("MANAGER", "PLANNER"))));
    }

    private final CrudService crud;
    private final WorkTaskRepository tasks;
    private final TimeEntryRepository timeEntries;
    private final PmOccurrenceRepository occurrences;
    private final InventoryService inventory;
    private final PmService pm;

    public WorkOrderService(CrudService crud, WorkTaskRepository tasks, TimeEntryRepository timeEntries,
                            PmOccurrenceRepository occurrences, InventoryService inventory, PmService pm) {
        this.crud = crud;
        this.tasks = tasks;
        this.timeEntries = timeEntries;
        this.occurrences = occurrences;
        this.inventory = inventory;
        this.pm = pm;
    }

    /** Transitions currently available to the calling user, for UI action rendering. */
    @Transactional(readOnly = true)
    public List<String> availableTransitions(UUID id) {
        WorkOrder wo = crud.load(WorkOrder.class, id);
        Principal p = CurrentUser.require();
        List<String> out = new java.util.ArrayList<>();
        for (Rule r : RULES.getOrDefault(wo.status, List.of())) {
            if (p.is("ADMIN") || r.roles().contains(p.role())) out.add(r.to());
        }
        if (ACTIVE.contains(wo.status) && p.is("ADMIN", "MANAGER", "SAFETY_OFFICER")) out.add("ON_HOLD");
        if ("ON_HOLD".equals(wo.status) && p.is("ADMIN", "MANAGER", "SAFETY_OFFICER")) out.add("RESUME");
        if ((ACTIVE.contains(wo.status) || "ON_HOLD".equals(wo.status)) && !"IN_PROGRESS".equals(wo.status) && p.is("ADMIN", "MANAGER")) out.add("CANCELLED");
        if (Set.of("REVIEWED", "CLOSED").contains(wo.status) && p.is("ADMIN", "MANAGER")) out.add("REOPEN");
        return out;
    }

    @Transactional
    public WorkOrder transition(UUID id, String target, String ifMatch, Map<String, Object> body) {
        WorkOrder wo = crud.load(WorkOrder.class, id);
        CrudService.checkVersion(wo, ifMatch, body);
        Principal p = CurrentUser.require();
        if (p.is("CUSTOMER", "AUDITOR")) throw ApiException.forbidden("Not permitted");
        String reason = str(body, "reason");
        String from = wo.status;

        switch (target) {
            case "ON_HOLD" -> {
                Access.requireRole("MANAGER", "SAFETY_OFFICER");
                if (!ACTIVE.contains(from)) throw ApiException.guard("INVALID_TRANSITION", "Only active work can be put on hold");
                require(reason, "A hold reason is required");
                wo.previousStatus = from;
                wo.holdReason = reason;
                wo.status = "ON_HOLD";
                return save(wo, from, "WorkOrderHeld.v1", reason);
            }
            case "RESUME" -> {
                Access.requireRole("MANAGER", "SAFETY_OFFICER");
                if (!"ON_HOLD".equals(from)) throw ApiException.guard("INVALID_TRANSITION", "Work order is not on hold");
                wo.status = wo.previousStatus == null ? "PLANNED" : wo.previousStatus;
                wo.previousStatus = null;
                wo.holdReason = null;
                return save(wo, from, "WorkOrderResumed.v1", reason);
            }
            case "CANCELLED" -> {
                Access.requireRole("MANAGER");
                if (!(ACTIVE.contains(from) || "ON_HOLD".equals(from)) || "IN_PROGRESS".equals(from)) {
                    throw ApiException.guard("INVALID_TRANSITION", "Cannot cancel a work order in status " + from);
                }
                require(reason, "A cancellation reason is required");
                wo.cancelReason = reason;
                wo.status = "CANCELLED";
                inventory.releaseAllForWorkOrder(wo.id);
                return save(wo, from, "WorkOrderCancelled.v1", reason);
            }
            default -> { /* lifecycle transition */ }
        }

        Rule rule = RULES.getOrDefault(from, List.of()).stream().filter(r -> r.to().equals(target)).findFirst()
                .orElseThrow(() -> ApiException.guard("INVALID_TRANSITION", "Transition " + from + " → " + target + " is not allowed"));
        if (!p.is("ADMIN") && !rule.roles().contains(p.role())) {
            throw ApiException.forbidden("Role " + p.role() + " cannot move a work order to " + target);
        }

        switch (target) {
            case "TRIAGED" -> {
                if (wo.priority == null || wo.workType == null) throw ApiException.guard("TRIAGE_INCOMPLETE", "Priority and work type are required");
            }
            case "PLANNED" -> {
                if (wo.estimatedHours == null) throw ApiException.guard("PLAN_INCOMPLETE", "Estimated hours are required to plan");
                if (tasks.findByWorkOrderId(wo.id).isEmpty()) throw ApiException.guard("PLAN_INCOMPLETE", "At least one task is required to plan");
            }
            case "DISPATCHED" -> {
                if (wo.assigneeId == null) throw ApiException.guard("NO_ASSIGNEE", "Assign a technician before dispatch");
                if (wo.assetId != null) {
                    Asset a = crud.load(Asset.class, wo.assetId);
                    if ("LOCKED_OUT".equals(a.safetyState) && !Boolean.TRUE.equals(wo.permitRequired)) {
                        throw ApiException.guard("SAFETY_BLOCK", "Asset is locked out; a permit-controlled work order is required");
                    }
                }
            }
            case "IN_PROGRESS" -> {
                if (Boolean.TRUE.equals(wo.permitRequired)) {
                    if (wo.permitId == null) throw ApiException.guard("PERMIT_REQUIRED", "An active work permit must be linked before starting");
                    WorkPermit permit = crud.load(WorkPermit.class, wo.permitId);
                    Instant now = Instant.now();
                    if (!"ACTIVE".equals(permit.status) || permit.validTo == null || permit.validTo.isBefore(now)
                            || (permit.validFrom != null && permit.validFrom.isAfter(now))) {
                        throw ApiException.guard("PERMIT_NOT_ACTIVE", "Linked permit " + permit.number + " is not active and valid now (online revalidation)");
                    }
                }
                if (wo.actualStart == null) wo.actualStart = Instant.now();
            }
            case "WORK_COMPLETED" -> {
                long open = tasks.findByWorkOrderId(wo.id).stream()
                        .filter(t -> Boolean.TRUE.equals(t.required) && "PENDING".equals(t.status)).count();
                if (open > 0) throw ApiException.guard("TASKS_OPEN", open + " required task(s) still pending");
                wo.actualEnd = Instant.now();
                wo.completedBy = p.name();
                if (body != null && body.get("completionNotes") != null) wo.completionNotes = body.get("completionNotes").toString();
            }
            case "REVIEWED" -> {
                if (Objects.equals(wo.completedBy, p.name())) {
                    throw ApiException.guard("SEPARATION_OF_DUTIES", "The person who performed the work cannot review it");
                }
                wo.reviewedBy = p.name();
            }
            case "CLOSED" -> {
                if (inventory.openReservationCount(wo.id) > 0) {
                    throw ApiException.guard("STOCK_UNRECONCILED", "Issue or release all open part reservations before closing");
                }
                long unapproved = timeEntries.findByWorkOrderId(wo.id).stream().filter(t -> !Boolean.TRUE.equals(t.approved)).count();
                if (unapproved > 0) throw ApiException.guard("TIME_UNAPPROVED", unapproved + " time entr(ies) await approval");
                String code = str(body, "closeoutCode");
                require(code, "A closeout code is required");
                wo.closeoutCode = code;
                recomputeCosts(wo);
                if (wo.slaDueAt != null && wo.actualEnd != null) wo.slaBreached = wo.actualEnd.isAfter(wo.slaDueAt);
                completeOccurrence(wo);
                pm.onWorkClosed(wo);
                // WO-INV-07: closure never restores asset status automatically.
            }
            default -> { }
        }
        wo.status = target;
        return save(wo, from, eventFor(target), reason);
    }

    /** WO-INV-06: reopening creates a linked follow-up work order; the signed record is untouched. */
    @Transactional
    public WorkOrder reopen(UUID id, Map<String, Object> body) {
        Access.requireRole("MANAGER");
        WorkOrder src = crud.load(WorkOrder.class, id);
        if (!Set.of("REVIEWED", "CLOSED").contains(src.status)) throw ApiException.guard("INVALID_TRANSITION", "Only reviewed or closed work can be reopened");
        String reason = str(body, "reason");
        require(reason, "A reopen reason is required");
        WorkOrder f = new WorkOrder();
        f.title = "Follow-up: " + src.title;
        f.description = "Reopened from " + src.number + ". Reason: " + reason;
        f.workType = "CORRECTIVE";
        f.priority = src.priority;
        f.assetId = src.assetId;
        f.siteId = src.siteId;
        f.locationId = src.locationId;
        f.customerId = src.customerId;
        f.contractId = src.contractId;
        f.parentWorkOrderId = src.id;
        WorkOrder saved = crud.persistNew(f);
        crud.saveDomain(src, "REOPEN", "WorkOrderReopened.v1", Map.of("followUp", saved.number, "reason", reason));
        return saved;
    }

    @Transactional
    public WorkTask recordTask(UUID woId, UUID taskId, Map<String, Object> body) {
        WorkOrder wo = crud.load(WorkOrder.class, woId);
        if (!"IN_PROGRESS".equals(wo.status)) throw ApiException.guard("NOT_IN_PROGRESS", "Tasks can be recorded only while work is in progress");
        WorkTask t = crud.load(WorkTask.class, taskId);
        if (!t.workOrderId.equals(woId)) throw ApiException.notFound("Task");
        String status = str(body, "status");
        if (!Set.of("DONE", "SKIPPED", "FAILED", "PENDING").contains(status)) throw ApiException.invalid("Invalid task status");
        if ("SKIPPED".equals(status) && Boolean.TRUE.equals(t.required)) throw ApiException.guard("TASK_REQUIRED", "Required tasks cannot be skipped");
        t.status = status;
        t.result = str(body, "result");
        t.measuredValue = str(body, "measuredValue");
        t.completedBy = CurrentUser.actorName();
        t.completedAt = Instant.now();
        return crud.saveDomain(t, "TASK_RECORDED", "WorkTaskRecorded.v1", Map.of("status", status, "workOrder", wo.number));
    }

    @Transactional
    public Map<String, Object> costs(UUID id) {
        WorkOrder wo = crud.load(WorkOrder.class, id);
        BigDecimal labor = BigDecimal.ZERO;
        BigDecimal hours = BigDecimal.ZERO;
        for (TimeEntry t : timeEntries.findByWorkOrderId(id)) {
            labor = labor.add(Clock.nz(t.cost));
            hours = hours.add(Clock.nz(t.hours));
        }
        BigDecimal parts = inventory.issuedCost(id);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("workOrder", wo.number);
        m.put("laborHours", hours);
        m.put("laborCost", labor);
        m.put("partsCost", parts);
        m.put("totalCost", labor.add(parts));
        m.put("estimatedHours", wo.estimatedHours);
        return m;
    }

    private void recomputeCosts(WorkOrder wo) {
        Map<String, Object> c = costs(wo.id);
        wo.laborCost = (BigDecimal) c.get("laborCost");
        wo.partsCost = (BigDecimal) c.get("partsCost");
    }

    private void completeOccurrence(WorkOrder wo) {
        if (wo.pmPlanId == null) return;
        for (PmOccurrence o : occurrences.findByWorkOrderId(wo.id)) {
            o.status = "COMPLETED";
            o.completedAt = Instant.now();
            occurrences.save(o);
        }
    }

    private WorkOrder save(WorkOrder wo, String from, String event, String reason) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("from", from);
        d.put("to", wo.status);
        d.put("number", wo.number);
        if (reason != null) d.put("reason", reason);
        return crud.saveDomain(wo, "TRANSITION", event, d);
    }

    private static String eventFor(String target) {
        return switch (target) {
            case "TRIAGED" -> "WorkOrderTriaged.v1";
            case "APPROVED" -> "WorkOrderApproved.v1";
            case "PLANNED" -> "WorkOrderPlanned.v1";
            case "DISPATCHED" -> "WorkOrderDispatched.v1";
            case "IN_PROGRESS" -> "WorkOrderStarted.v1";
            case "WORK_COMPLETED" -> "WorkCompleted.v1";
            case "REVIEWED" -> "WorkReviewed.v1";
            case "CLOSED" -> "WorkOrderClosed.v1";
            default -> "WorkOrderChanged.v1";
        };
    }

    static String str(Map<String, Object> body, String key) {
        if (body == null || body.get(key) == null) return null;
        String s = body.get(key).toString().trim();
        return s.isEmpty() ? null : s;
    }

    static void require(String v, String message) {
        if (v == null) throw ApiException.guard("REASON_REQUIRED", message);
    }
}
