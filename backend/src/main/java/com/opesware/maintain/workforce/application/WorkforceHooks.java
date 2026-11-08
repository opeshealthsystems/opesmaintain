package com.opesware.maintain.workforce.application;

import com.opesware.maintain.maintenance.domain.WorkOrder;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.Clock;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.application.ResourceHook;
import com.opesware.maintain.workforce.domain.Assignment;
import com.opesware.maintain.workforce.domain.Technician;
import com.opesware.maintain.workforce.domain.TimeEntry;
import com.opesware.maintain.workforce.infrastructure.AssignmentRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

public final class WorkforceHooks {
    private WorkforceHooks() {}

    /** Labor costing (spec §13.4): hours × technician rate, overtime ×1.5. */
    @Component
    public static class TimeEntryHook implements ResourceHook {
        private final CrudService crud;

        public TimeEntryHook(CrudService crud) { this.crud = crud; }

        @Override
        public String path() { return "time-entries"; }

        @Override
        public void beforeCreate(Object e) { compute((TimeEntry) e, true); }

        @Override
        public void beforeUpdate(Object e) { compute((TimeEntry) e, false); }

        private void compute(TimeEntry t, boolean creating) {
            if (!t.endedAt.isAfter(t.startedAt)) throw ApiException.invalid("End time must be after start time");
            if (Clock.hoursBetween(t.startedAt, t.endedAt).compareTo(BigDecimal.valueOf(16)) > 0) {
                throw ApiException.invalid("A single time entry cannot exceed 16 hours");
            }
            WorkOrder wo = crud.load(WorkOrder.class, t.workOrderId);
            if (creating && Set.of("CLOSED", "CANCELLED").contains(wo.status)) throw ApiException.guard("RECORD_LOCKED", "Work order is closed");
            Technician tech = crud.load(Technician.class, t.technicianId);
            if (t.laborType == null) t.laborType = "REGULAR";
            if (t.approved == null) t.approved = false;
            t.hours = Clock.hoursBetween(t.startedAt, t.endedAt);
            BigDecimal factor = "OVERTIME".equals(t.laborType) ? new BigDecimal("1.5") : BigDecimal.ONE;
            t.rate = Clock.nz(tech.hourlyRate).multiply(factor);
            t.cost = t.hours.multiply(t.rate).setScale(2, RoundingMode.HALF_UP);
        }
    }

    /** Assigning a lead technician sets the work-order assignee used by the dispatch guard. */
    @Component
    public static class AssignmentHook implements ResourceHook {
        private final CrudService crud;
        private final AssignmentRepository assignments;

        public AssignmentHook(CrudService crud, AssignmentRepository assignments) {
            this.crud = crud;
            this.assignments = assignments;
        }

        @Override
        public String path() { return "assignments"; }

        @Override
        public void beforeCreate(Object e) {
            Assignment a = (Assignment) e;
            if (!a.scheduledEnd.isAfter(a.scheduledStart)) throw ApiException.invalid("Scheduled end must be after start");
            if (a.status == null) a.status = "PLANNED";
            if (a.role == null) a.role = "LEAD";
            Technician tech = crud.load(Technician.class, a.technicianId);
            if ("LEAVE".equals(tech.availability)) throw ApiException.guard("TECHNICIAN_UNAVAILABLE", tech.fullName + " is on leave");
            boolean overlap = assignments.findByTechnicianId(a.technicianId).stream()
                    .filter(x -> !Set.of("CANCELLED", "DECLINED", "COMPLETED").contains(x.status))
                    .anyMatch(x -> x.scheduledStart.isBefore(a.scheduledEnd) && a.scheduledStart.isBefore(x.scheduledEnd));
            if (overlap) throw ApiException.guard("SCHEDULE_CONFLICT", tech.fullName + " already has an overlapping assignment");
        }

        @Override
        public void afterSave(Object e, boolean created) {
            Assignment a = (Assignment) e;
            if (!created || !"LEAD".equals(a.role)) return;
            WorkOrder wo = crud.load(WorkOrder.class, a.workOrderId);
            if (Set.of("CLOSED", "CANCELLED").contains(wo.status)) return;
            wo.assigneeId = a.technicianId;
            if (wo.plannedStart == null) wo.plannedStart = a.scheduledStart;
            if (wo.plannedEnd == null) wo.plannedEnd = a.scheduledEnd;
            crud.saveDomain(wo, "ASSIGN", "WorkOrderAssigned.v1", Map.of("technician", a.technicianId.toString()));
        }
    }
}
