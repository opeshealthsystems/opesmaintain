package com.opesware.maintain.reliability.application;

import com.opesware.maintain.asset.domain.Asset;
import com.opesware.maintain.calibration.domain.CalibrationPlan;
import com.opesware.maintain.integration.domain.SensorAlert;
import com.opesware.maintain.inventory.application.InventoryService;
import com.opesware.maintain.inventory.domain.Part;
import com.opesware.maintain.maintenance.domain.PmPlan;
import com.opesware.maintain.maintenance.domain.WorkOrder;
import com.opesware.maintain.platform.application.Access;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.Clock;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.application.ResourceHook;
import com.opesware.maintain.platform.security.CurrentUser;
import com.opesware.maintain.reliability.domain.AiInsight;
import com.opesware.maintain.reliability.domain.DowntimeEvent;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Maintenance intelligence (OM-M28). Recommendations are explainable, deterministic rules with a
 * stated rationale and confidence; they are proposals only and never act without human review.
 */
@Service
public class InsightService {
    private final CrudService crud;
    private final EntityManager em;
    private final InventoryService inventory;
    private final PredictiveService predictive;

    public InsightService(CrudService crud, EntityManager em, InventoryService inventory, PredictiveService predictive) {
        this.predictive = predictive;
        this.crud = crud;
        this.em = em;
        this.inventory = inventory;
    }

    @Transactional
    public int refresh(UUID tenant) {
        Set<String> existing = new HashSet<>();
        for (AiInsight i : q("select i from AiInsight i where i.tenantId = :t and i.status = 'PROPOSED'", AiInsight.class, tenant)) {
            existing.add(i.insightType + ":" + i.assetId + ":" + i.title);
        }
        int created = 0;
        Instant now = Instant.now();
        Map<UUID, Asset> assets = new HashMap<>();
        for (Asset a : q("select a from Asset a where a.tenantId = :t", Asset.class, tenant)) assets.put(a.id, a);

        // Repeat failures: ≥3 corrective/emergency work orders on one asset in 90 days.
        Map<UUID, Integer> repeats = new HashMap<>();
        for (WorkOrder w : q("select w from WorkOrder w where w.tenantId = :t", WorkOrder.class, tenant)) {
            if (w.assetId != null && Set.of("CORRECTIVE", "EMERGENCY").contains(w.workType) && w.createdAt.isAfter(now.minus(Duration.ofDays(90)))) {
                repeats.merge(w.assetId, 1, Integer::sum);
            }
        }
        for (var en : repeats.entrySet()) {
            if (en.getValue() < 3 || !assets.containsKey(en.getKey())) continue;
            Asset a = assets.get(en.getKey());
            created += add(existing, a.id, "REPEAT_FAILURE", "Repeat failures on " + a.name,
                    en.getValue() + " corrective work orders in the last 90 days exceed the threshold of 3.",
                    "Schedule a root-cause analysis and review the PM task list for " + a.tag + ".", 0.8);
        }
        // Overdue PM
        for (PmPlan p : q("select p from PmPlan p where p.tenantId = :t and p.status = 'ACTIVE'", PmPlan.class, tenant)) {
            if (p.nextDueAt != null && p.nextDueAt.isBefore(now.minus(Duration.ofDays(3)))) {
                created += add(existing, p.assetId, "OVERDUE_PM", "PM overdue: " + p.name,
                        "Next due " + p.nextDueAt + " has passed by more than 3 days without generated work.",
                        "Generate the PM work order now or adjust the plan schedule.", 0.95);
            }
        }
        // Low stock
        List<Part> parts = q("select p from Part p where p.tenantId = :t and p.status = 'ACTIVE'", Part.class, tenant);
        inventory.enrich(parts);
        for (Part p : parts) {
            if (p.reorderPoint != null && p.available.compareTo(p.reorderPoint) <= 0) {
                created += add(existing, null, "LOW_STOCK", "Reorder " + p.partNo + " " + p.name,
                        "Available " + p.available.stripTrailingZeros().toPlainString() + " " + p.unit + " is at or below reorder point " + p.reorderPoint.stripTrailingZeros().toPlainString() + ".",
                        "Raise a purchase requisition for " + Clock.nz(p.reorderQty).stripTrailingZeros().toPlainString() + " " + p.unit + ".", Boolean.TRUE.equals(p.criticalSpare) ? 0.9 : 0.7);
            }
        }
        // Calibration due within 14 days
        for (CalibrationPlan c : q("select c from CalibrationPlan c where c.tenantId = :t and c.status = 'ACTIVE'", CalibrationPlan.class, tenant)) {
            if (c.nextDueOn != null && !c.nextDueOn.isAfter(LocalDate.now().plusDays(14))) {
                Asset a = assets.get(c.assetId);
                created += add(existing, c.assetId, "CALIBRATION_DUE", "Calibration due: " + (a == null ? "instrument" : a.name),
                        "Next calibration date " + c.nextDueOn + " is within 14 days.", "Schedule a calibration event with " + c.provider + ".", 0.95);
            }
        }
        // Sensor alarms open
        for (SensorAlert s : q("select s from SensorAlert s where s.tenantId = :t and s.status = 'OPEN' and s.severity = 'ALARM'", SensorAlert.class, tenant)) {
            Asset a = assets.get(s.assetId);
            created += add(existing, s.assetId, "SENSOR_ALARM", "Condition alarm on " + (a == null ? "asset" : a.name),
                    "Reading " + s.value.stripTrailingZeros().toPlainString() + " breached alarm threshold " + s.threshold.stripTrailingZeros().toPlainString() + ".",
                    "Inspect the asset and convert the alert into a corrective work order if confirmed.", 0.75);
        }
        // Statistical meter anomalies (|z| ≥ 3 against the meter's own history)
        for (PredictiveService.Anomaly an : predictive.meterAnomalies(tenant)) {
            Asset a = assets.get(an.meter().assetId);
            created += add(existing, an.meter().assetId, "METER_ANOMALY", "Unusual " + an.basis() + ": " + an.meter().name + (a == null ? "" : " on " + a.name),
                    String.format("Latest %s %.2f %s is %.1fσ from its mean %.2f (σ %.2f) over %d prior values.", an.basis(), an.latest(), an.meter().unit, an.z(), an.mean(), an.sd(), an.n()),
                    "Inspect the asset and verify the meter; record a meter reset if it was replaced.", Math.min(0.9, 0.5 + Math.abs(an.z()) / 20));
        }
        // Failure forecast within 14 days
        for (Asset a : assets.values()) {
            PredictiveService.Forecast f = predictive.forecast(a.id);
            if (f.predictedNext() != null && f.predictedNext().isBefore(now.plus(Duration.ofDays(14)))) {
                created += add(existing, a.id, "REPEAT_FAILURE", "Failure expected soon: " + a.name,
                        String.format("%d unplanned failures, mean interval %.1f days; next expected around %s.", f.failures(), f.mtbfDays(), f.predictedNext().toString().substring(0, 10)),
                        "Bring forward preventive work or stage critical spares for " + a.tag + ".", f.confidence());
            }
        }
        // Long open downtime
        for (DowntimeEvent d : q("select d from DowntimeEvent d where d.tenantId = :t and d.endedAt is null", DowntimeEvent.class, tenant)) {
            if (d.startedAt.isBefore(now.minus(Duration.ofHours(24)))) {
                Asset a = assets.get(d.assetId);
                created += add(existing, d.assetId, "SLA_RISK", "Extended downtime: " + (a == null ? "asset" : a.name),
                        "Asset has been down since " + d.startedAt + " (over 24 hours).", "Escalate parts availability or contractor support.", 0.85);
            }
        }
        return created;
    }

    private int add(Set<String> existing, UUID assetId, String type, String title, String rationale, String action, double confidence) {
        String key = type + ":" + assetId + ":" + title;
        if (!existing.add(key)) return 0;
        AiInsight i = new AiInsight();
        i.assetId = assetId;
        i.insightType = type;
        i.title = title;
        i.rationale = rationale;
        i.suggestedAction = action;
        i.confidence = BigDecimal.valueOf(confidence);
        i.status = "PROPOSED";
        crud.persistNew(i);
        return 1;
    }

    @Transactional
    public AiInsight review(UUID id, boolean accept) {
        Access.requireRole("MANAGER", "PLANNER");
        AiInsight i = crud.load(AiInsight.class, id);
        if (!"PROPOSED".equals(i.status)) throw ApiException.guard("ALREADY_REVIEWED", "Insight already " + i.status.toLowerCase());
        i.status = accept ? "ACCEPTED" : "REJECTED";
        i.reviewedBy = CurrentUser.actorName();
        i.reviewedAt = Instant.now();
        return crud.saveDomain(i, accept ? "ACCEPT" : "REJECT", "InsightReviewed.v1", Map.of("decision", i.status));
    }

    private <T> List<T> q(String jpql, Class<T> type, UUID tenant) {
        return em.createQuery(jpql, type).setParameter("t", tenant).getResultList();
    }

    @Component
    public static class DowntimeHook implements ResourceHook {
        @Override
        public String path() { return "downtime-events"; }

        @Override
        public void beforeCreate(Object e) { compute((DowntimeEvent) e); }

        @Override
        public void beforeUpdate(Object e) { compute((DowntimeEvent) e); }

        private void compute(DowntimeEvent d) {
            if (d.endedAt != null && !d.endedAt.isAfter(d.startedAt)) throw ApiException.invalid("Downtime end must be after start");
            d.durationHours = d.endedAt == null ? null : Clock.hoursBetween(d.startedAt, d.endedAt);
            d.status = d.endedAt == null ? "OPEN" : "CLOSED";
        }
    }
}
