package com.opesware.maintain.maintenance.application;

import com.opesware.maintain.maintenance.domain.PmOccurrence;
import com.opesware.maintain.maintenance.domain.PmPlan;
import com.opesware.maintain.maintenance.domain.WorkOrder;
import com.opesware.maintain.maintenance.domain.WorkTask;
import com.opesware.maintain.maintenance.infrastructure.PmOccurrenceRepository;
import com.opesware.maintain.maintenance.infrastructure.PmPlanRepository;
import com.opesware.maintain.platform.application.Access;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.CrudService;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Preventive maintenance (spec §6.4, §13.1). Occurrences are computed in site-local calendar
 * terms (never fixed 24h additions) and are idempotent on tenant+plan+version+occurrence key.
 */
@Service
public class PmService {
    private static final LocalTime DUE_TIME = LocalTime.of(8, 0);
    private final CrudService crud;
    private final PmPlanRepository plans;
    private final PmOccurrenceRepository occurrences;

    public PmService(CrudService crud, PmPlanRepository plans, PmOccurrenceRepository occurrences) {
        this.crud = crud;
        this.plans = plans;
        this.occurrences = occurrences;
    }

    @Transactional
    public PmPlan command(UUID id, String action) {
        Access.requireRole("MANAGER", "PLANNER");
        PmPlan p = crud.load(PmPlan.class, id);
        String from = p.status;
        switch (action) {
            case "approve" -> {
                if (!"DRAFT".equals(from)) throw bad(p);
                p.status = "APPROVED";
            }
            case "activate" -> {
                if (!("APPROVED".equals(from) || "DRAFT".equals(from))) throw bad(p);
                if ("DRAFT".equals(from)) Access.requireRole("MANAGER");
                p.status = "ACTIVE";
                if (!"METER".equals(p.triggerType)) p.nextDueAt = firstDue(p, Instant.now());
            }
            case "pause" -> {
                if (!"ACTIVE".equals(from)) throw bad(p);
                p.status = "PAUSED";
            }
            case "resume" -> {
                if (!"PAUSED".equals(from)) throw bad(p);
                p.status = "ACTIVE";
                if (!"METER".equals(p.triggerType)) p.nextDueAt = firstDue(p, Instant.now());
            }
            case "retire" -> {
                if ("RETIRED".equals(from)) throw bad(p);
                p.status = "RETIRED";
                p.nextDueAt = null;
            }
            default -> throw ApiException.notFound("Action " + action);
        }
        return crud.saveDomain(p, action.toUpperCase(), "PmPlan" + cap(action) + "d.v1", Map.of("from", from, "to", p.status));
    }

    /** Forecast the next N occurrences without creating anything. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> forecast(UUID id, int count) {
        PmPlan p = crud.load(PmPlan.class, id);
        List<Map<String, Object>> out = new ArrayList<>();
        if ("METER".equals(p.triggerType)) return out;
        ZoneId zone = zone(p);
        Instant cursor = p.nextDueAt != null ? p.nextDueAt : firstDue(p, Instant.now());
        for (int i = 0; i < count && cursor != null; i++) {
            ZonedDateTime local = cursor.atZone(zone);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("dueAt", cursor.toString());
            m.put("localDue", local.toLocalDate() + " " + local.toLocalTime() + " " + zone.getId());
            out.add(m);
            cursor = advance(p, local).toInstant();
        }
        return out;
    }

    /** Generates work for every active plan due within its lead window. */
    @Transactional
    public int generateDue(UUID tenantId) {
        int created = 0;
        Instant now = Instant.now();
        for (PmPlan p : plans.findByTenantId(tenantId)) {
            if (!"ACTIVE".equals(p.status) || "METER".equals(p.triggerType) || p.nextDueAt == null) continue;
            int guard = 0;
            while (p.nextDueAt != null && p.nextDueAt.minusSeconds(86400L * lead(p)).isBefore(now) && guard++ < 24) {
                ZonedDateTime local = p.nextDueAt.atZone(zone(p));
                if (generate(p, "C:" + local.toLocalDate(), p.nextDueAt) != null) created++;
                if ("AFTER_COMPLETION".equals(p.scheduleMode)) {
                    p.nextDueAt = null; // re-armed when the generated work closes
                    break;
                }
                p.nextDueAt = advance(p, local).toInstant();
            }
            p.lastGeneratedAt = now;
            crud.saveDomain(p, "PM_SCHEDULE", null, Map.of("nextDueAt", String.valueOf(p.nextDueAt)));
        }
        return created;
    }

    /** Meter rule: trigger once per crossed threshold; replays of the same threshold are no-ops. */
    @Transactional
    public void onMeterReading(UUID meterId, BigDecimal value) {
        for (PmPlan p : plans.findByMeterId(meterId)) {
            if (!"ACTIVE".equals(p.status) || "CALENDAR".equals(p.triggerType)) continue;
            if (p.nextMeterThreshold == null || p.meterInterval == null) continue;
            if (value.compareTo(p.nextMeterThreshold) >= 0) {
                generate(p, "M:" + p.nextMeterThreshold.stripTrailingZeros().toPlainString(), Instant.now());
                while (p.nextMeterThreshold.compareTo(value) <= 0) p.nextMeterThreshold = p.nextMeterThreshold.add(p.meterInterval);
                crud.saveDomain(p, "PM_METER_TRIGGER", "PmMeterTriggered.v1", Map.of("value", value.toPlainString()));
            }
        }
    }

    /** Re-arms after-completion plans once their generated work order is closed. */
    @Transactional
    public void onWorkClosed(WorkOrder wo) {
        if (wo.pmPlanId == null) return;
        PmPlan p = crud.load(PmPlan.class, wo.pmPlanId);
        if ("ACTIVE".equals(p.status) && "AFTER_COMPLETION".equals(p.scheduleMode) && !"METER".equals(p.triggerType)) {
            p.nextDueAt = advance(p, Instant.now().atZone(zone(p)).with(DUE_TIME)).toInstant();
            crud.saveDomain(p, "PM_REARM", null, Map.of());
        }
    }

    @Transactional
    public WorkOrder generateNow(UUID planId) {
        Access.requireRole("MANAGER", "PLANNER");
        PmPlan p = crud.load(PmPlan.class, planId);
        if (!"ACTIVE".equals(p.status)) throw ApiException.guard("PLAN_NOT_ACTIVE", "Only active plans generate work");
        Instant due = p.nextDueAt != null ? p.nextDueAt : Instant.now();
        String key = "C:" + due.atZone(zone(p)).toLocalDate();
        WorkOrder wo = generate(p, key, due);
        if (wo == null) {
            PmOccurrence existing = occurrences.findByPlanId(p.id).stream()
                    .filter(o -> key.equals(o.occurrenceKey) && p.planVersion.equals(o.planVersion)).findFirst().orElseThrow();
            return crud.load(WorkOrder.class, existing.workOrderId);
        }
        if (p.nextDueAt != null && !"AFTER_COMPLETION".equals(p.scheduleMode)) {
            p.nextDueAt = advance(p, p.nextDueAt.atZone(zone(p))).toInstant();
            crud.saveDomain(p, "PM_SCHEDULE", null, Map.of());
        }
        return wo;
    }

    /** Returns the created work order, or null when the occurrence already exists (idempotent). */
    private WorkOrder generate(PmPlan p, String key, Instant due) {
        boolean exists = occurrences.findByPlanId(p.id).stream()
                .anyMatch(o -> key.equals(o.occurrenceKey) && p.planVersion.equals(o.planVersion));
        if (exists) return null;
        WorkOrder wo = new WorkOrder();
        wo.title = "PM: " + p.name;
        wo.description = "Generated from plan " + p.code + " v" + p.planVersion + " (" + key + ")";
        wo.workType = p.workType == null ? "PREVENTIVE" : p.workType;
        wo.priority = p.priority == null ? "PLANNED" : p.priority;
        wo.assetId = p.assetId;
        wo.siteId = p.siteId;
        wo.pmPlanId = p.id;
        wo.estimatedHours = p.estimatedHours;
        wo.dueAt = due;
        wo.plannedStart = due;
        WorkOrder saved = crud.persistNew(wo);
        if (p.taskList != null) {
            int seq = 1;
            for (String line : p.taskList.split("\\r?\\n")) {
                if (line.isBlank()) continue;
                WorkTask t = new WorkTask();
                t.workOrderId = saved.id;
                t.sequence = seq++;
                t.description = line.trim();
                t.required = true;
                t.status = "PENDING";
                crud.persistNew(t);
            }
        }
        PmOccurrence o = new PmOccurrence();
        o.planId = p.id;
        o.planVersion = p.planVersion;
        o.occurrenceKey = key;
        o.dueAt = due;
        ZonedDateTime local = due.atZone(zone(p));
        o.localDue = local.toLocalDate() + " " + local.toLocalTime() + " " + zone(p).getId();
        o.workOrderId = saved.id;
        o.status = "GENERATED";
        crud.persistNew(o);
        return saved;
    }

    Instant firstDue(PmPlan p, Instant from) {
        ZoneId zone = zone(p);
        ZonedDateTime cursor = ZonedDateTime.of(p.anchorDate == null ? LocalDate.now(zone) : p.anchorDate, DUE_TIME, zone);
        ZonedDateTime floor = from.atZone(zone).toLocalDate().atTime(DUE_TIME).atZone(zone);
        int guard = 0;
        while (cursor.isBefore(floor) && guard++ < 5000) cursor = advance(p, cursor);
        return cursor.toInstant();
    }

    /** Calendar arithmetic in the site zone; DST gaps resolve forward via ZonedDateTime rules. */
    static ZonedDateTime advance(PmPlan p, ZonedDateTime local) {
        int n = p.intervalValue == null || p.intervalValue <= 0 ? 1 : p.intervalValue;
        String unit = p.intervalUnit == null ? "MONTH" : p.intervalUnit;
        return switch (unit) {
            case "DAY" -> local.plusDays(n);
            case "WEEK" -> local.plusWeeks(n);
            case "YEAR" -> local.plusYears(n);
            default -> local.plusMonths(n);
        };
    }

    private static ZoneId zone(PmPlan p) {
        try {
            return p.timeZone == null ? ZoneId.of("UTC") : ZoneId.of(p.timeZone);
        } catch (RuntimeException e) {
            return ZoneId.of("UTC");
        }
    }

    private static int lead(PmPlan p) {
        return p.leadDays == null ? 0 : p.leadDays;
    }

    private static String cap(String s) {
        return Character.toUpperCase(s.charAt(0)) + s.substring(1).replace("activate", "activate");
    }

    private static ApiException bad(PmPlan p) {
        return ApiException.guard("INVALID_TRANSITION", "Plan is " + p.status);
    }
}
