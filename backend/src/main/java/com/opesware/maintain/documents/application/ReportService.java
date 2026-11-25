package com.opesware.maintain.documents.application;

import com.opesware.maintain.asset.domain.Asset;
import com.opesware.maintain.calibration.domain.CalibrationPlan;
import com.opesware.maintain.documents.domain.ReportJob;
import com.opesware.maintain.inventory.application.InventoryService;
import com.opesware.maintain.inventory.domain.Part;
import com.opesware.maintain.maintenance.domain.PmOccurrence;
import com.opesware.maintain.maintenance.domain.PmPlan;
import com.opesware.maintain.maintenance.domain.WorkOrder;
import com.opesware.maintain.organization.domain.Site;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.Clock;
import com.opesware.maintain.platform.application.Fields;
import com.opesware.maintain.platform.application.ResourceHook;
import com.opesware.maintain.platform.security.CurrentUser;
import com.opesware.maintain.reliability.domain.DowntimeEvent;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Authorized tabular reports (OM-M25). Same tenant scoping as interactive queries. */
@Service
public class ReportService {
    private final EntityManager em;
    private final InventoryService inventory;

    public ReportService(EntityManager em, InventoryService inventory) {
        this.em = em;
        this.inventory = inventory;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> run(String type, LocalDate from, LocalDate to) {
        var p = CurrentUser.require();
        if (!p.internal() || CurrentUser.scope() != null) throw ApiException.forbidden("Reports are available to internal users of the organization");
        UUID t = p.tenantId();
        Instant a = from.atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant b = to.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        Map<UUID, String> sites = new HashMap<>();
        for (Site s : q("select s from Site s where s.tenantId = :t", Site.class, t)) sites.put(s.id, s.name);
        Map<UUID, Asset> assets = new HashMap<>();
        for (Asset x : q("select x from Asset x where x.tenantId = :t", Asset.class, t)) assets.put(x.id, x);
        List<String> cols;
        List<List<Object>> rows = new ArrayList<>();
        String title;
        switch (type) {
            case "WORK_ORDER_SUMMARY" -> {
                title = "Work order summary";
                cols = List.of("Number", "Title", "Type", "Priority", "Status", "Asset", "Site", "Created", "Due", "Labor cost", "Parts cost");
                for (WorkOrder w : q("select w from WorkOrder w where w.tenantId = :t order by w.createdAt", WorkOrder.class, t)) {
                    if (w.createdAt.isBefore(a) || !w.createdAt.isBefore(b)) continue;
                    rows.add(List.of(w.number, w.title, w.workType, w.priority, w.status, assetName(assets, w.assetId), sites.getOrDefault(w.siteId, ""),
                            w.createdAt.toString().substring(0, 10), w.dueAt == null ? "" : w.dueAt.toString().substring(0, 10), Clock.nz(w.laborCost), Clock.nz(w.partsCost)));
                }
            }
            case "ASSET_REGISTER" -> {
                title = "Asset register";
                cols = List.of("Tag", "Name", "Type", "Manufacturer", "Model", "Serial", "Criticality", "Status", "Safety", "Site", "Warranty end", "Purchase cost");
                for (Asset x : assets.values().stream().sorted((m, n) -> m.tag.compareTo(n.tag)).toList()) {
                    rows.add(List.of(x.tag, x.name, x.assetType, s(x.manufacturer), s(x.model), s(x.serialNumber), x.criticality, x.status, s(x.safetyState),
                            sites.getOrDefault(x.siteId, ""), x.warrantyEnd == null ? "" : x.warrantyEnd.toString(), Clock.nz(x.purchaseCost)));
                }
            }
            case "PM_COMPLIANCE" -> {
                title = "Preventive maintenance compliance";
                cols = List.of("Plan", "Asset", "Due", "Status", "Completed", "On time");
                Map<UUID, PmPlan> plans = new HashMap<>();
                for (PmPlan pl : q("select p from PmPlan p where p.tenantId = :t", PmPlan.class, t)) plans.put(pl.id, pl);
                for (PmOccurrence o : q("select o from PmOccurrence o where o.tenantId = :t order by o.dueAt", PmOccurrence.class, t)) {
                    if (o.dueAt.isBefore(a) || !o.dueAt.isBefore(b)) continue;
                    PmPlan pl = plans.get(o.planId);
                    boolean onTime = o.completedAt != null && !o.completedAt.isAfter(o.dueAt.plusSeconds(7 * 86400));
                    rows.add(List.of(pl == null ? "" : pl.name, pl == null ? "" : assetName(assets, pl.assetId), o.localDue, o.status,
                            o.completedAt == null ? "" : o.completedAt.toString().substring(0, 10), onTime ? "Yes" : "No"));
                }
            }
            case "INVENTORY_VALUATION" -> {
                title = "Inventory valuation";
                cols = List.of("Part no.", "Name", "Category", "Unit", "On hand", "Reserved", "Available", "Unit cost", "Value", "Reorder point");
                List<Part> parts = q("select p from Part p where p.tenantId = :t order by p.partNo", Part.class, t);
                inventory.enrich(parts);
                for (Part x : parts) {
                    rows.add(List.of(x.partNo, x.name, s(x.category), x.unit, x.onHand, x.reserved, x.available, Clock.nz(x.unitCost),
                            x.onHand.multiply(Clock.nz(x.unitCost)), Clock.nz(x.reorderPoint)));
                }
            }
            case "SLA_PERFORMANCE" -> {
                title = "SLA performance";
                cols = List.of("Number", "Title", "Priority", "Customer SLA due", "Completed", "Breached");
                for (WorkOrder w : q("select w from WorkOrder w where w.tenantId = :t and w.slaDueAt is not null order by w.slaDueAt", WorkOrder.class, t)) {
                    if (w.slaDueAt.isBefore(a) || !w.slaDueAt.isBefore(b)) continue;
                    boolean breached = w.actualEnd != null ? w.actualEnd.isAfter(w.slaDueAt) : Instant.now().isAfter(w.slaDueAt);
                    rows.add(List.of(w.number, w.title, w.priority, w.slaDueAt.toString().substring(0, 16).replace('T', ' '),
                            w.actualEnd == null ? "Open" : w.actualEnd.toString().substring(0, 16).replace('T', ' '), breached ? "Yes" : "No"));
                }
            }
            case "DOWNTIME" -> {
                title = "Downtime analysis";
                cols = List.of("Asset", "Type", "Failure mode", "Impact", "Started", "Ended", "Hours");
                for (DowntimeEvent d : q("select d from DowntimeEvent d where d.tenantId = :t order by d.startedAt", DowntimeEvent.class, t)) {
                    if (d.startedAt.isBefore(a) || !d.startedAt.isBefore(b)) continue;
                    rows.add(List.of(assetName(assets, d.assetId), d.downtimeType, s(d.failureMode), s(d.impact), d.startedAt.toString().substring(0, 16).replace('T', ' '),
                            d.endedAt == null ? "Open" : d.endedAt.toString().substring(0, 16).replace('T', ' '),
                            d.endedAt == null ? Clock.hoursBetween(d.startedAt, Instant.now()) : Clock.nz(d.durationHours)));
                }
            }
            case "CALIBRATION_STATUS" -> {
                title = "Calibration status";
                cols = List.of("Instrument", "Standard", "Interval (months)", "Last calibrated", "Next due", "Provider", "State");
                for (CalibrationPlan c : q("select c from CalibrationPlan c where c.tenantId = :t order by c.nextDueOn", CalibrationPlan.class, t)) {
                    String state = c.nextDueOn == null ? "Unscheduled" : c.nextDueOn.isBefore(LocalDate.now()) ? "Overdue"
                            : c.nextDueOn.isBefore(LocalDate.now().plusDays(30)) ? "Due within 30 days" : "Current";
                    rows.add(List.of(assetName(assets, c.assetId), s(c.standard), c.intervalMonths, c.lastCalibratedOn == null ? "" : c.lastCalibratedOn.toString(),
                            c.nextDueOn == null ? "" : c.nextDueOn.toString(), s(c.provider), state));
                }
            }
            case "COST_BY_SITE" -> {
                title = "Maintenance cost by site";
                cols = List.of("Site", "Closed work orders", "Labor cost", "Parts cost", "Total");
                Map<String, BigDecimal[]> agg = new LinkedHashMap<>();
                for (WorkOrder w : q("select w from WorkOrder w where w.tenantId = :t and w.status = 'CLOSED'", WorkOrder.class, t)) {
                    if (w.actualEnd == null || w.actualEnd.isBefore(a) || !w.actualEnd.isBefore(b)) continue;
                    BigDecimal[] v = agg.computeIfAbsent(sites.getOrDefault(w.siteId, "Unassigned"), k -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO});
                    v[0] = v[0].add(BigDecimal.ONE);
                    v[1] = v[1].add(Clock.nz(w.laborCost));
                    v[2] = v[2].add(Clock.nz(w.partsCost));
                }
                for (var en : agg.entrySet()) rows.add(List.of(en.getKey(), en.getValue()[0], en.getValue()[1], en.getValue()[2], en.getValue()[1].add(en.getValue()[2])));
            }
            default -> throw ApiException.notFound("Report " + type);
        }
        List<List<Object>> jsonRows = new ArrayList<>();
        for (List<Object> r : rows) jsonRows.add(r.stream().map(Fields::toJson).toList());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("type", type);
        out.put("title", title);
        out.put("from", from.toString());
        out.put("to", to.toString());
        out.put("generatedAt", Instant.now().toString());
        out.put("generatedBy", p.name());
        out.put("columns", cols);
        out.put("rows", jsonRows);
        return out;
    }

    private static String assetName(Map<UUID, Asset> assets, UUID id) {
        Asset x = id == null ? null : assets.get(id);
        return x == null ? "" : x.tag + " · " + x.name;
    }

    private static String s(String v) {
        return v == null ? "" : v;
    }

    private <T> List<T> q(String jpql, Class<T> type, UUID t) {
        return em.createQuery(jpql, type).setParameter("t", t).getResultList();
    }

    /** Report jobs run synchronously at submission and record their outcome. */
    @Component
    public static class ReportJobHook implements ResourceHook {
        private final ReportService reports;

        public ReportJobHook(ReportService reports) { this.reports = reports; }

        @Override
        public String path() { return "report-jobs"; }

        @Override
        public void beforeCreate(Object e) {
            ReportJob j = (ReportJob) e;
            j.requestedBy = CurrentUser.actorName();
            try {
                Map<String, Object> r = reports.run(j.reportType, LocalDate.now().minusDays(365), LocalDate.now());
                j.rowCount = ((List<?>) r.get("rows")).size();
                j.status = "COMPLETED";
            } catch (RuntimeException ex) {
                j.status = "FAILED";
            }
            j.completedAt = Instant.now();
        }
    }
}
