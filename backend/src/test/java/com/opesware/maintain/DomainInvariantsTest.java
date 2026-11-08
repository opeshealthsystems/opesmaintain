package com.opesware.maintain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.opesware.maintain.asset.domain.Asset;
import com.opesware.maintain.asset.domain.Meter;
import com.opesware.maintain.asset.domain.MeterReading;
import com.opesware.maintain.identity.domain.AppUser;
import com.opesware.maintain.inventory.application.InventoryService;
import com.opesware.maintain.inventory.domain.Part;
import com.opesware.maintain.inventory.domain.StockMovement;
import com.opesware.maintain.inventory.domain.StockReservation;
import com.opesware.maintain.inventory.domain.Warehouse;
import com.opesware.maintain.maintenance.application.PmService;
import com.opesware.maintain.maintenance.application.RequestService;
import com.opesware.maintain.maintenance.application.WorkOrderService;
import com.opesware.maintain.maintenance.domain.MaintenanceRequest;
import com.opesware.maintain.maintenance.domain.PmPlan;
import com.opesware.maintain.maintenance.domain.WorkOrder;
import com.opesware.maintain.maintenance.domain.WorkTask;
import com.opesware.maintain.organization.domain.Site;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.domain.Tenant;
import com.opesware.maintain.platform.infrastructure.TenantRepo;
import com.opesware.maintain.platform.security.CurrentUser;
import com.opesware.maintain.platform.security.Principal;
import com.opesware.maintain.safety.application.SafetyService;
import com.opesware.maintain.safety.domain.WorkPermit;
import com.opesware.maintain.workforce.domain.Assignment;
import com.opesware.maintain.workforce.domain.Technician;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;

/** Cross-domain acceptance checks drawn from spec §6 and §19 (AT-M02, WO-INV-01/03/05, §6.4, §6.5, §6.7). */
@SpringBootTest
@ActiveProfiles("test")
class DomainInvariantsTest {

    @Autowired CrudService crud;
    @Autowired WorkOrderService workOrders;
    @Autowired RequestService requests;
    @Autowired PmService pm;
    @Autowired InventoryService inventory;
    @Autowired SafetyService safety;
    @Autowired TenantRepo tenants;
    @Autowired PlatformTransactionManager tm;

    UUID tenantA;
    UUID tenantB;
    Map<String, Principal> people = new HashMap<>();
    UUID siteId;
    UUID assetId;

    @BeforeEach
    void setUp() {
        tenantA = tenant("a-" + UUID.randomUUID());
        tenantB = tenant("b-" + UUID.randomUUID());
        people.clear();
        as(tenantA, "admin", "ADMIN", () -> {
            for (String role : new String[]{"MANAGER", "PLANNER", "DISPATCHER", "TECHNICIAN", "STOREKEEPER", "SAFETY_OFFICER"}) person(tenantA, role);
            Site s = new Site();
            s.code = "S1"; s.name = "Site one"; s.timeZone = "Africa/Douala";
            siteId = crud.persistNew(s).id;
            Asset a = new Asset();
            a.tag = "A-1"; a.name = "Pump"; a.assetType = "PLUMBING"; a.criticality = "B_HIGH"; a.siteId = siteId;
            assetId = crud.persistNew(a).id;
            return null;
        });
        as(tenantB, "intruder", "ADMIN", () -> null);
    }

    @AfterEach
    void clear() {
        CurrentUser.clear();
    }

    @Test
    void foreignTenantIdsAreIndistinguishableFromMissing() {
        UUID woId = as(tenantA, "admin", "ADMIN", () -> newWorkOrder().id);
        as(tenantB, "intruder", "ADMIN", () -> {
            assertThatThrownBy(() -> crud.get("work-orders", woId)).isInstanceOf(ApiException.class)
                    .satisfies(e -> assertThat(((ApiException) e).status()).isEqualTo(404));
            assertThat((Long) crud.list("work-orders", Map.of()).get("total")).isZero();
            return null;
        });
    }

    @Test
    void staleVersionIsRejectedWithPreconditionFailed() {
        UUID woId = as(tenantA, "admin", "ADMIN", () -> newWorkOrder().id);
        as(tenantA, "admin", "ADMIN", () -> {
            Map<String, Object> current = crud.get("work-orders", woId);
            crud.update("work-orders", woId, Map.of("title", "First edit"), String.valueOf(current.get("version")));
            assertThatThrownBy(() -> crud.update("work-orders", woId, Map.of("title", "Lost update"), String.valueOf(current.get("version"))))
                    .satisfies(e -> assertThat(((ApiException) e).status()).isEqualTo(412));
            return null;
        });
    }

    @Test
    void lifecycleGuardsAndSeparationOfDuties() {
        WorkOrder wo = as(tenantA, "admin", "ADMIN", this::newWorkOrder);
        // cannot skip approvals
        as(tenantA, "tech", "TECHNICIAN", () -> {
            assertThatThrownBy(() -> workOrders.transition(wo.id, "IN_PROGRESS", null, ver(wo.id)))
                    .satisfies(e -> assertThat(((ApiException) e).code()).isEqualTo("INVALID_TRANSITION"));
            return null;
        });
        as(tenantA, "dispatcher", "DISPATCHER", () -> workOrders.transition(wo.id, "TRIAGED", null, ver(wo.id)));
        as(tenantA, "dispatcher", "DISPATCHER", () -> {
            assertThatThrownBy(() -> workOrders.transition(wo.id, "APPROVED", null, ver(wo.id))).isInstanceOf(ApiException.class);
            return null;
        });
        as(tenantA, "manager", "MANAGER", () -> workOrders.transition(wo.id, "APPROVED", null, ver(wo.id)));
        as(tenantA, "planner", "PLANNER", () -> {
            WorkTask t = new WorkTask();
            t.workOrderId = wo.id; t.description = "Inspect seal";
            crud.persistNew(t);
            return workOrders.transition(wo.id, "PLANNED", null, ver(wo.id));
        });
        as(tenantA, "dispatcher", "DISPATCHER", () -> {
            assertThatThrownBy(() -> workOrders.transition(wo.id, "DISPATCHED", null, ver(wo.id)))
                    .satisfies(e -> assertThat(((ApiException) e).code()).isEqualTo("NO_ASSIGNEE"));
            Technician tech = new Technician();
            tech.fullName = "tech"; tech.trade = "MECHANICAL"; tech.hourlyRate = new BigDecimal("10");
            tech = crud.persistNew(tech);
            Assignment a = new Assignment();
            a.workOrderId = wo.id; a.technicianId = tech.id; a.scheduledStart = Instant.now(); a.scheduledEnd = Instant.now().plus(Duration.ofHours(2));
            crud.persistNew(a);
            return workOrders.transition(wo.id, "DISPATCHED", null, ver(wo.id));
        });
        as(tenantA, "tech", "TECHNICIAN", () -> workOrders.transition(wo.id, "IN_PROGRESS", null, ver(wo.id)));
        as(tenantA, "tech", "TECHNICIAN", () -> {
            assertThatThrownBy(() -> workOrders.transition(wo.id, "WORK_COMPLETED", null, ver(wo.id)))
                    .satisfies(e -> assertThat(((ApiException) e).code()).isEqualTo("TASKS_OPEN"));
            WorkTask t = ((com.opesware.maintain.maintenance.infrastructure.WorkTaskRepository) crud.repo(WorkTask.class)).findByWorkOrderId(wo.id).getFirst();
            workOrders.recordTask(wo.id, t.id, Map.of("status", "DONE"));
            return workOrders.transition(wo.id, "WORK_COMPLETED", null, ver(wo.id));
        });
        // the performer cannot review their own work even with a privileged role
        as(tenantA, "tech", "ADMIN", () -> {
            assertThatThrownBy(() -> workOrders.transition(wo.id, "REVIEWED", null, ver(wo.id)))
                    .satisfies(e -> assertThat(((ApiException) e).code()).isEqualTo("SEPARATION_OF_DUTIES"));
            return null;
        });
        as(tenantA, "manager", "MANAGER", () -> workOrders.transition(wo.id, "REVIEWED", null, ver(wo.id)));
        WorkOrder closed = as(tenantA, "manager", "MANAGER", () -> {
            Map<String, Object> b = ver(wo.id);
            b.put("closeoutCode", "FIXED");
            return workOrders.transition(wo.id, "CLOSED", null, b);
        });
        assertThat(closed.status).isEqualTo("CLOSED");
        // reopen creates a linked follow-up rather than modifying the signed record
        WorkOrder follow = as(tenantA, "manager", "MANAGER", () -> workOrders.reopen(wo.id, Map.of("reason", "Leak returned")));
        assertThat(follow.parentWorkOrderId).isEqualTo(wo.id);
        assertThat(as(tenantA, "manager", "MANAGER", () -> crud.load(WorkOrder.class, wo.id)).status).isEqualTo("CLOSED");
    }

    @Test
    void stockLedgerPreventsOverReservationAndIsIdempotent() {
        as(tenantA, "stores", "STOREKEEPER", () -> {
            Part p = new Part();
            p.partNo = "P-1"; p.name = "Seal"; p.unit = "pcs"; p.unitCost = new BigDecimal("5");
            p = crud.persistNew(p);
            Warehouse w = new Warehouse();
            w.code = "W1"; w.name = "Main";
            w = crud.persistNew(w);
            StockMovement first = inventory.receive(p.id, w.id, new BigDecimal("3"), null, "GRN-1", "op-1");
            StockMovement replay = inventory.receive(p.id, w.id, new BigDecimal("3"), null, "GRN-1", "op-1");
            assertThat(replay.id).isEqualTo(first.id);
            assertThat(inventory.onHand(p.id, w.id)).isEqualByComparingTo("3");
            WorkOrder wo = newWorkOrder();
            StockReservation r = inventory.reserve(p.id, w.id, wo.id, new BigDecimal("2"), "res-1");
            final UUID pid = p.id;
            final UUID wid = w.id;
            assertThatThrownBy(() -> inventory.reserve(pid, wid, wo.id, new BigDecimal("2"), "res-2"))
                    .satisfies(e -> assertThat(((ApiException) e).code()).isEqualTo("INSUFFICIENT_STOCK"));
            inventory.issue(r.id, null, "iss-1");
            assertThat(inventory.onHand(p.id, w.id)).isEqualByComparingTo("1");
            assertThat(inventory.issuedCost(wo.id)).isEqualByComparingTo("10");
            return null;
        });
    }

    @Test
    void pmGenerationAndRequestConversionAreIdempotent() {
        as(tenantA, "planner", "MANAGER", () -> {
            PmPlan plan = new PmPlan();
            plan.name = "Monthly check"; plan.assetId = assetId; plan.triggerType = "CALENDAR"; plan.intervalValue = 1; plan.intervalUnit = "MONTH";
            plan.anchorDate = LocalDate.now(); plan.taskList = "Check\nClean";
            plan = crud.persistNew(plan);
            pm.command(plan.id, "activate");
            WorkOrder w1 = pm.generateNow(plan.id);
            PmPlan reloaded = crud.load(PmPlan.class, plan.id);
            assertThat(reloaded.nextDueAt).isAfter(Instant.now().plus(Duration.ofDays(20)));
            assertThat(w1.pmPlanId).isEqualTo(plan.id);

            MaintenanceRequest r = new MaintenanceRequest();
            r.title = "Leak"; r.description = "Water on floor"; r.siteId = siteId; r.priority = "HIGH";
            r = crud.persistNew(r);
            WorkOrder a = requests.convert(r.id, Map.of());
            WorkOrder b = requests.convert(r.id, Map.of());
            assertThat(b.id).isEqualTo(a.id);
            return null;
        });
    }

    @Test
    void permitRequesterCannotIssueAndCumulativeMeterCannotRunBackwards() {
        as(tenantA, "safety", "SAFETY_OFFICER", () -> {
            WorkPermit p = new WorkPermit();
            p.permitType = "HOT_WORK"; p.siteId = siteId; p.scope = "Weld"; p.hazards = "Fire"; p.controls = "Watch";
            p.validFrom = Instant.now().minus(Duration.ofHours(1)); p.validTo = Instant.now().plus(Duration.ofHours(4));
            WorkPermit saved = crud.persistNew(p);
            safety.permit(saved.id, "submit", Map.of());
            safety.permit(saved.id, "verify", Map.of());
            assertThatThrownBy(() -> safety.permit(saved.id, "issue", Map.of()))
                    .satisfies(e -> assertThat(((ApiException) e).code()).isEqualTo("SEPARATION_OF_DUTIES"));

            Meter m = new Meter();
            m.assetId = assetId; m.name = "Hours"; m.meterType = "CUMULATIVE"; m.unit = "h";
            m = crud.persistNew(m);
            MeterReading r1 = new MeterReading();
            r1.meterId = m.id; r1.value = new BigDecimal("100"); r1.readingAt = Instant.now().minus(Duration.ofHours(1));
            crud.persistNew(r1);
            MeterReading r2 = new MeterReading();
            r2.meterId = m.id; r2.value = new BigDecimal("90"); r2.readingAt = Instant.now();
            assertThat(crud.persistNew(r2).accepted).isFalse();
            return null;
        });
    }

    // ------------------------------------------------------------------ helpers

    private WorkOrder newWorkOrder() {
        WorkOrder w = new WorkOrder();
        w.title = "Fix pump"; w.workType = "CORRECTIVE"; w.priority = "HIGH"; w.assetId = assetId; w.siteId = siteId; w.estimatedHours = new BigDecimal("2");
        return crud.persistNew(w);
    }

    private Map<String, Object> ver(UUID id) {
        Map<String, Object> m = new HashMap<>();
        m.put("version", crud.repo(WorkOrder.class).findById(id).orElseThrow().version);
        return m;
    }

    private UUID tenant(String code) {
        Tenant t = new Tenant();
        t.id = UUID.randomUUID(); t.code = code; t.legalName = code; t.status = "ACTIVE"; t.timeZone = "Africa/Douala"; t.currency = "XAF";
        return tenants.save(t).id;
    }

    private void person(UUID tenant, String role) {
        AppUser u = new AppUser();
        u.fullName = role.toLowerCase(); u.email = role.toLowerCase() + "-" + tenant + "@test"; u.role = role; u.status = "ACTIVE";
        crud.persistNew(u);
    }

    private <T> T as(UUID tenant, String name, String role, Supplier<T> work) {
        CurrentUser.set(new Principal(UUID.randomUUID(), tenant, name + "@test", name, role, null));
        try {
            return work.get(); // each service call runs in its own transaction
        } finally {
            CurrentUser.clear();
        }
    }
}
