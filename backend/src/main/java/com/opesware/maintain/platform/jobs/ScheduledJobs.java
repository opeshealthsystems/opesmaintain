package com.opesware.maintain.platform.jobs;

import com.opesware.maintain.integration.application.IntegrationService;
import com.opesware.maintain.maintenance.application.PmService;
import com.opesware.maintain.maintenance.domain.WorkOrder;
import com.opesware.maintain.maintenance.infrastructure.WorkOrderRepository;
import com.opesware.maintain.organization.domain.ServiceGrant;
import com.opesware.maintain.organization.infrastructure.ServiceGrantRepository;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.domain.Tenant;
import com.opesware.maintain.platform.infrastructure.TenantRepo;
import com.opesware.maintain.platform.security.CurrentUser;
import com.opesware.maintain.reliability.application.InsightService;
import com.opesware.maintain.safety.application.SafetyService;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Background workers. Each tenant runs in isolation; failures are logged durably, never swallowed silently. */
@Component
public class ScheduledJobs {
    private static final Logger log = LoggerFactory.getLogger(ScheduledJobs.class);
    private static final Set<String> OPEN = Set.of("DRAFT", "TRIAGED", "APPROVED", "PLANNED", "DISPATCHED", "IN_PROGRESS", "ON_HOLD");
    private final boolean enabled;
    private final TenantRepo tenants;
    private final PmService pm;
    private final SafetyService safety;
    private final InsightService insights;
    private final IntegrationService integration;
    private final WorkOrderRepository workOrders;
    private final ServiceGrantRepository grants;
    private final CrudService crud;

    public ScheduledJobs(@Value("${opes.jobs.enabled:true}") boolean enabled, TenantRepo tenants, PmService pm, SafetyService safety,
                         InsightService insights, IntegrationService integration, WorkOrderRepository workOrders,
                         ServiceGrantRepository grants, CrudService crud) {
        this.enabled = enabled;
        this.tenants = tenants;
        this.pm = pm;
        this.safety = safety;
        this.insights = insights;
        this.integration = integration;
        this.workOrders = workOrders;
        this.grants = grants;
        this.crud = crud;
    }

    @Scheduled(initialDelay = 60_000, fixedDelay = 300_000)
    public void every5Minutes() {
        forEachTenant("pm-generation", t -> pm.generateDue(t.id));
        forEachTenant("permit-expiry", t -> safety.expirePermits(t.id));
        forEachTenant("sla-monitor", t -> {
            Instant now = Instant.now();
            int n = 0;
            for (WorkOrder w : workOrders.findByTenantId(t.id)) {
                if (OPEN.contains(w.status) && w.slaDueAt != null && w.slaDueAt.isBefore(now) && !Boolean.TRUE.equals(w.slaBreached)) {
                    w.slaBreached = true;
                    crud.saveDomain(w, "SLA_BREACHED", "SlaBreached.v1", Map.of("number", w.number));
                    n++;
                }
            }
            return n;
        });
        forEachTenant("grant-expiry", t -> {
            int n = 0;
            for (ServiceGrant g : grants.findByTenantId(t.id)) {
                if ("ACTIVE".equals(g.status) && g.validTo.isBefore(LocalDate.now())) {
                    g.status = "EXPIRED";
                    crud.saveDomain(g, "EXPIRE", "ServiceGrantExpired.v1", Map.of());
                    n++;
                }
            }
            return n;
        });
    }

    @Scheduled(initialDelay = 30_000, fixedDelay = 30_000)
    public void outbox() {
        forEachTenant("outbox-dispatch", t -> integration.dispatch(t.id));
    }

    @Scheduled(initialDelay = 120_000, fixedDelay = 3_600_000)
    public void hourly() {
        forEachTenant("insights", t -> insights.refresh(t.id));
    }

    private void forEachTenant(String job, java.util.function.Function<Tenant, Integer> work) {
        if (!enabled) return;
        for (Tenant t : tenants.findAll()) {
            if (!"ACTIVE".equals(t.status)) continue;
            try {
                Integer n = CurrentUser.runAsSystem(t.id, () -> work.apply(t));
                if (n != null && n > 0) log.info("job={} tenant={} affected={}", job, t.code, n);
            } catch (RuntimeException e) {
                log.error("job={} tenant={} failed", job, t.code, e);
            }
        }
    }
}
