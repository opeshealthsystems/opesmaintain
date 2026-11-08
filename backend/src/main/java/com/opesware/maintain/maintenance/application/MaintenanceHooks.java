package com.opesware.maintain.maintenance.application;

import com.opesware.maintain.asset.domain.Asset;
import com.opesware.maintain.asset.domain.Meter;
import com.opesware.maintain.commercial.domain.ServiceContract;
import com.opesware.maintain.commercial.domain.SlaPolicy;
import com.opesware.maintain.commercial.infrastructure.SlaPolicyRepository;
import com.opesware.maintain.maintenance.domain.MaintenanceRequest;
import com.opesware.maintain.maintenance.domain.PmPlan;
import com.opesware.maintain.maintenance.domain.WorkOrder;
import com.opesware.maintain.maintenance.domain.WorkTask;
import com.opesware.maintain.maintenance.infrastructure.WorkTaskRepository;
import com.opesware.maintain.organization.domain.Location;
import com.opesware.maintain.organization.domain.Site;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.Clock;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.application.ResourceHook;
import com.opesware.maintain.platform.security.CurrentUser;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import org.springframework.stereotype.Component;

/** Creation defaults and invariants for maintenance aggregates. */
public final class MaintenanceHooks {
    private MaintenanceHooks() {}

    @Component
    public static class WorkOrderHook implements ResourceHook {
        private final CrudService crud;
        private final SlaPolicyRepository slas;

        public WorkOrderHook(CrudService crud, SlaPolicyRepository slas) {
            this.crud = crud;
            this.slas = slas;
        }

        @Override
        public String path() { return "work-orders"; }

        @Override
        public void beforeCreate(Object e) {
            WorkOrder wo = (WorkOrder) e;
            wo.status = "DRAFT";
            if (wo.priority == null) wo.priority = "MEDIUM";
            if (wo.workType == null) wo.workType = "CORRECTIVE";
            if (wo.assetId != null) {
                Asset a = crud.load(Asset.class, wo.assetId);
                if (wo.siteId == null) wo.siteId = a.siteId;
                if (wo.locationId == null) wo.locationId = a.locationId;
                if (wo.customerId == null) wo.customerId = a.customerId;
                if ("LOCKED_OUT".equals(a.safetyState) || "PERMIT_REQUIRED".equals(a.safetyState)) wo.permitRequired = true;
                wo.assetSnapshot = snapshot(a, wo.locationId);
            }
            Instant created = Instant.now();
            SlaPolicy policy = null;
            if (wo.contractId != null) {
                ServiceContract c = crud.load(ServiceContract.class, wo.contractId);
                if (c.slaPolicyId != null) policy = crud.load(SlaPolicy.class, c.slaPolicyId);
            }
            if (policy == null) {
                policy = slas.findByTenantId(CurrentUser.requireTenant()).stream()
                        .filter(p -> Objects.equals(p.priority, wo.priority)).findFirst().orElse(null);
            }
            if (policy != null && policy.resolutionHours != null) {
                wo.slaDueAt = created.plus(Duration.ofMinutes(policy.resolutionHours.multiply(BigDecimal.valueOf(60)).longValue()));
                if (wo.dueAt == null) wo.dueAt = wo.slaDueAt;
            }
            wo.slaBreached = false;
        }

        @Override
        public void beforeUpdate(Object e) {
            WorkOrder wo = (WorkOrder) e;
            if ("CLOSED".equals(wo.status) || "CANCELLED".equals(wo.status)) {
                throw ApiException.guard("RECORD_LOCKED", "Closed or cancelled work orders are immutable; reopen to create a follow-up");
            }
        }

        private String snapshot(Asset a, java.util.UUID locationId) {
            String loc = "";
            if (locationId != null) loc = crud.load(Location.class, locationId).name;
            String site = a.siteId == null ? "" : crud.load(Site.class, a.siteId).name;
            return a.tag + " · " + a.name + " · " + site + (loc.isEmpty() ? "" : " / " + loc) + " · status " + a.status;
        }
    }

    @Component
    public static class RequestHook implements ResourceHook {
        private final CrudService crud;

        public RequestHook(CrudService crud) { this.crud = crud; }

        @Override
        public String path() { return "maintenance-requests"; }

        @Override
        public void beforeCreate(Object e) {
            MaintenanceRequest r = (MaintenanceRequest) e;
            r.status = "SUBMITTED";
            r.receivedAt = Instant.now();
            if (CurrentUser.get() != null && CurrentUser.get().is("CUSTOMER")) r.channel = "PORTAL";
            if (r.channel == null) r.channel = "WEB";
            if (r.reportedBy == null) r.reportedBy = CurrentUser.actorName();
            if (r.siteId == null && r.assetId != null) r.siteId = crud.load(Asset.class, r.assetId).siteId;
        }
    }

    @Component
    public static class TaskHook implements ResourceHook {
        private final WorkTaskRepository tasks;
        private final CrudService crud;

        public TaskHook(WorkTaskRepository tasks, CrudService crud) {
            this.tasks = tasks;
            this.crud = crud;
        }

        @Override
        public String path() { return "work-tasks"; }

        @Override
        public void beforeCreate(Object e) {
            WorkTask t = (WorkTask) e;
            WorkOrder wo = crud.load(WorkOrder.class, t.workOrderId);
            if (java.util.Set.of("WORK_COMPLETED", "REVIEWED", "CLOSED", "CANCELLED").contains(wo.status)) {
                throw ApiException.guard("RECORD_LOCKED", "Tasks cannot be added after work completion");
            }
            if (t.status == null) t.status = "PENDING";
            if (t.required == null) t.required = true;
            if (t.sequence == null) t.sequence = tasks.findByWorkOrderId(t.workOrderId).size() + 1;
        }
    }

    @Component
    public static class PmPlanHook implements ResourceHook {
        private final CrudService crud;

        public PmPlanHook(CrudService crud) { this.crud = crud; }

        @Override
        public String path() { return "pm-plans"; }

        @Override
        public void beforeCreate(Object e) {
            PmPlan p = (PmPlan) e;
            p.status = "DRAFT";
            p.planVersion = 1;
            Asset a = crud.load(Asset.class, p.assetId);
            p.siteId = a.siteId;
            if (p.timeZone == null && a.siteId != null) p.timeZone = crud.load(Site.class, a.siteId).timeZone;
            if (p.scheduleMode == null) p.scheduleMode = "FIXED";
            if (p.workType == null) p.workType = "PREVENTIVE";
            if (p.priority == null) p.priority = "PLANNED";
            if (p.leadDays == null) p.leadDays = 7;
            validate(p);
            if (p.meterId != null && p.meterInterval != null) {
                Meter m = crud.load(Meter.class, p.meterId);
                p.nextMeterThreshold = Clock.nz(m.lastReading).add(p.meterInterval);
            }
        }

        @Override
        public void beforeUpdate(Object e) {
            PmPlan p = (PmPlan) e;
            validate(p);
            if ("ACTIVE".equals(p.status) || "PAUSED".equals(p.status)) {
                // Activated schedule versions are immutable: an edit creates the next version.
                p.planVersion = p.planVersion + 1;
            }
            if ("RETIRED".equals(p.status)) throw ApiException.guard("RECORD_LOCKED", "Retired plans cannot be edited");
        }

        private void validate(PmPlan p) {
            boolean calendar = !"METER".equals(p.triggerType);
            boolean meter = !"CALENDAR".equals(p.triggerType);
            if (calendar && (p.intervalValue == null || p.intervalValue <= 0 || p.intervalUnit == null)) {
                throw ApiException.invalid("Calendar plans need a positive interval and unit");
            }
            if (meter && (p.meterId == null || p.meterInterval == null || p.meterInterval.signum() <= 0)) {
                throw ApiException.invalid("Meter plans need a meter and a positive meter interval");
            }
        }
    }
}
