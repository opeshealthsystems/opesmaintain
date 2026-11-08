package com.opesware.maintain.reliability.application;

import com.opesware.maintain.asset.domain.Asset;
import com.opesware.maintain.maintenance.domain.MaintenanceRequest;
import com.opesware.maintain.maintenance.domain.PmOccurrence;
import com.opesware.maintain.maintenance.domain.WorkOrder;
import com.opesware.maintain.organization.domain.Site;
import com.opesware.maintain.platform.application.Clock;
import com.opesware.maintain.reliability.domain.DowntimeEvent;
import com.opesware.maintain.platform.security.CurrentUser;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * KPI definitions per spec §13.3: MTTR = repair time / repairs; MTBF = operating time / failures;
 * availability = (period − downtime) / period; PM compliance = on-time completed / due in window.
 * Every KPI is returned with its period, numerator and denominator.
 */
@Service
public class KpiService {
    private static final Set<String> OPEN = Set.of("DRAFT", "TRIAGED", "APPROVED", "PLANNED", "DISPATCHED", "IN_PROGRESS", "ON_HOLD");
    private final EntityManager em;

    public KpiService(EntityManager em) {
        this.em = em;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> kpis(int days, UUID siteId) {
        if (CurrentUser.require().is("CUSTOMER")) throw com.opesware.maintain.platform.application.ApiException.forbidden("Not available");
        UUID t = CurrentUser.requireTenant();
        Instant to = Instant.now();
        Instant from = to.minus(Duration.ofDays(days));
        List<WorkOrder> wos = list("select w from WorkOrder w where w.tenantId = :t", WorkOrder.class, t);
        if (siteId != null) wos = wos.stream().filter(w -> siteId.equals(w.siteId)).toList();
        List<DowntimeEvent> downs = list("select d from DowntimeEvent d where d.tenantId = :t", DowntimeEvent.class, t);
        List<Asset> assets = list("select a from Asset a where a.tenantId = :t", Asset.class, t);
        if (siteId != null) {
            Set<UUID> ids = new java.util.HashSet<>();
            for (Asset a : assets) if (siteId.equals(a.siteId)) ids.add(a.id);
            assets = assets.stream().filter(a -> ids.contains(a.id)).toList();
            downs = downs.stream().filter(d -> ids.contains(d.assetId)).toList();
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("periodDays", days);
        out.put("from", from.toString());
        out.put("to", to.toString());

        long backlog = wos.stream().filter(w -> OPEN.contains(w.status)).count();
        long overdue = wos.stream().filter(w -> OPEN.contains(w.status) && w.dueAt != null && w.dueAt.isBefore(to)).count();
        out.put("backlog", backlog);
        out.put("overdue", overdue);
        out.put("emergencyOpen", wos.stream().filter(w -> OPEN.contains(w.status) && "EMERGENCY".equals(w.workType)).count());

        List<WorkOrder> closed = wos.stream().filter(w -> ("CLOSED".equals(w.status) || "REVIEWED".equals(w.status) || "WORK_COMPLETED".equals(w.status))
                && w.actualEnd != null && w.actualEnd.isAfter(from)).toList();
        List<WorkOrder> repairs = closed.stream().filter(w -> Set.of("CORRECTIVE", "EMERGENCY").contains(w.workType) && w.actualStart != null).toList();
        BigDecimal repairHours = repairs.stream().map(w -> Clock.hoursBetween(w.actualStart, w.actualEnd)).reduce(BigDecimal.ZERO, BigDecimal::add);
        out.put("mttrHours", kpi(repairHours, BigDecimal.valueOf(repairs.size()), "Σ repair hours / repairs"));

        List<DowntimeEvent> failures = downs.stream().filter(d -> "UNPLANNED".equals(d.downtimeType) && d.startedAt.isAfter(from)).toList();
        BigDecimal periodHours = BigDecimal.valueOf(Duration.between(from, to).toHours());
        BigDecimal downHours = BigDecimal.ZERO;
        for (DowntimeEvent d : downs) {
            Instant s = d.startedAt.isBefore(from) ? from : d.startedAt;
            Instant e = d.endedAt == null ? to : (d.endedAt.isAfter(to) ? to : d.endedAt);
            if (e.isAfter(s)) downHours = downHours.add(Clock.hoursBetween(s, e));
        }
        BigDecimal assetHours = periodHours.multiply(BigDecimal.valueOf(Math.max(1, assets.size())));
        out.put("mtbfHours", kpi(assetHours.subtract(downHours), BigDecimal.valueOf(failures.size()), "Σ operating hours / unplanned failures"));
        Map<String, Object> avail = kpi(assetHours.subtract(downHours).multiply(BigDecimal.valueOf(100)), assetHours, "(period − downtime) / period × 100");
        out.put("availabilityPct", avail);
        out.put("downtimeHours", downHours);

        List<PmOccurrence> occ = list("select o from PmOccurrence o where o.tenantId = :t", PmOccurrence.class, t).stream()
                .filter(o -> o.dueAt != null && o.dueAt.isAfter(from) && o.dueAt.isBefore(to)).toList();
        long onTime = occ.stream().filter(o -> "COMPLETED".equals(o.status) && o.completedAt != null
                && !o.completedAt.isAfter(o.dueAt.plus(Duration.ofDays(7)))).count();
        out.put("pmCompliancePct", kpi(BigDecimal.valueOf(onTime * 100), BigDecimal.valueOf(occ.size()), "PM completed within window / PM due × 100"));

        List<WorkOrder> slaScoped = closed.stream().filter(w -> w.slaDueAt != null).toList();
        long breached = slaScoped.stream().filter(w -> Boolean.TRUE.equals(w.slaBreached)).count();
        out.put("slaBreachPct", kpi(BigDecimal.valueOf(breached * 100), BigDecimal.valueOf(slaScoped.size()), "Breached / SLA-scoped closed × 100"));
        long slaAtRisk = wos.stream().filter(w -> OPEN.contains(w.status) && w.slaDueAt != null && w.slaDueAt.isBefore(to.plus(Duration.ofHours(24)))).count();
        out.put("slaAtRisk", slaAtRisk);

        BigDecimal labor = closed.stream().map(w -> Clock.nz(w.laborCost)).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal parts = closed.stream().map(w -> Clock.nz(w.partsCost)).reduce(BigDecimal.ZERO, BigDecimal::add);
        out.put("laborCost", labor);
        out.put("partsCost", parts);
        out.put("maintenanceCost", labor.add(parts));
        long planned = closed.stream().filter(w -> Set.of("PREVENTIVE", "INSPECTION", "CALIBRATION").contains(w.workType)).count();
        out.put("plannedWorkPct", kpi(BigDecimal.valueOf(planned * 100), BigDecimal.valueOf(closed.size()), "Planned closed / all closed × 100"));
        out.put("closedCount", closed.size());

        // breakdowns
        Map<String, Long> byStatus = new TreeMap<>();
        Map<String, Long> byType = new TreeMap<>();
        Map<String, Long> byPriority = new LinkedHashMap<>();
        for (String p : List.of("CRITICAL", "HIGH", "MEDIUM", "LOW", "PLANNED")) byPriority.put(p, 0L);
        for (WorkOrder w : wos) {
            byStatus.merge(w.status, 1L, Long::sum);
            if (OPEN.contains(w.status)) {
                byType.merge(w.workType, 1L, Long::sum);
                byPriority.merge(w.priority, 1L, Long::sum);
            }
        }
        out.put("workOrdersByStatus", byStatus);
        out.put("openByType", byType);
        out.put("openByPriority", byPriority);

        // weekly trend of created vs closed (last 8 weeks)
        List<Map<String, Object>> trend = new ArrayList<>();
        LocalDate monday = LocalDate.now(ZoneOffset.UTC).minusDays(LocalDate.now(ZoneOffset.UTC).getDayOfWeek().getValue() - 1L);
        for (int i = 7; i >= 0; i--) {
            LocalDate ws = monday.minusWeeks(i);
            Instant a = ws.atStartOfDay().toInstant(ZoneOffset.UTC);
            Instant b = a.plus(7, ChronoUnit.DAYS);
            long created = wos.stream().filter(w -> !w.createdAt.isBefore(a) && w.createdAt.isBefore(b)).count();
            long done = wos.stream().filter(w -> w.actualEnd != null && !w.actualEnd.isBefore(a) && w.actualEnd.isBefore(b)).count();
            trend.add(Map.of("week", ws.toString(), "created", created, "completed", done));
        }
        out.put("weeklyTrend", trend);

        // cost by site
        Map<UUID, String> siteNames = new HashMap<>();
        for (Site s : list("select s from Site s where s.tenantId = :t", Site.class, t)) siteNames.put(s.id, s.name);
        Map<String, BigDecimal> costBySite = new TreeMap<>();
        for (WorkOrder w : closed) {
            costBySite.merge(siteNames.getOrDefault(w.siteId, "Unassigned"), Clock.nz(w.laborCost).add(Clock.nz(w.partsCost)), BigDecimal::add);
        }
        out.put("costBySite", costBySite);

        // downtime by asset (top 8)
        Map<UUID, BigDecimal> dtByAsset = new HashMap<>();
        for (DowntimeEvent d : downs) {
            if (d.startedAt.isBefore(from)) continue;
            Instant e = d.endedAt == null ? to : d.endedAt;
            dtByAsset.merge(d.assetId, Clock.hoursBetween(d.startedAt, e), BigDecimal::add);
        }
        Map<UUID, Asset> assetIdx = new HashMap<>();
        for (Asset a : assets) assetIdx.put(a.id, a);
        List<Map<String, Object>> topDown = new ArrayList<>();
        dtByAsset.entrySet().stream().sorted((x, y) -> y.getValue().compareTo(x.getValue())).limit(8).forEach(en -> {
            Asset a = assetIdx.get(en.getKey());
            if (a != null) topDown.add(Map.of("asset", a.tag + " · " + a.name, "hours", en.getValue()));
        });
        out.put("downtimeByAsset", topDown);

        long requestsOpen = list("select r from MaintenanceRequest r where r.tenantId = :t", MaintenanceRequest.class, t).stream()
                .filter(r -> Set.of("SUBMITTED", "ACKNOWLEDGED", "TRIAGED").contains(r.status)).count();
        out.put("requestsOpen", requestsOpen);
        out.put("assetCount", assets.size());
        out.put("assetsOutOfService", assets.stream().filter(a -> Set.of("OUT_OF_SERVICE", "UNDER_MAINTENANCE", "QUARANTINED").contains(a.status)).count());
        out.put("assetsLockedOut", assets.stream().filter(a -> "LOCKED_OUT".equals(a.safetyState)).count());
        return out;
    }

    private <T> List<T> list(String jpql, Class<T> type, UUID tenant) {
        return em.createQuery(jpql, type).setParameter("t", tenant).getResultList();
    }

    static Map<String, Object> kpi(BigDecimal numerator, BigDecimal denominator, String formula) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("value", denominator.signum() == 0 ? null : numerator.divide(denominator, 1, RoundingMode.HALF_UP));
        m.put("numerator", numerator.setScale(1, RoundingMode.HALF_UP));
        m.put("denominator", denominator);
        m.put("formula", formula);
        return m;
    }
}
