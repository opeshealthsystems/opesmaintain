package com.opesware.maintain.onboarding.application;

import com.opesware.maintain.asset.domain.Asset;
import com.opesware.maintain.asset.domain.Meter;
import com.opesware.maintain.asset.infrastructure.MeterRepository;
import com.opesware.maintain.inventory.domain.Part;
import com.opesware.maintain.inventory.infrastructure.PartRepository;
import com.opesware.maintain.maintenance.domain.PmPlan;
import com.opesware.maintain.onboarding.domain.TenantCatalogClass;
import com.opesware.maintain.onboarding.infrastructure.TenantCatalogClassRepository;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.domain.Tenant;
import com.opesware.maintain.platform.infrastructure.TenantRepo;
import com.opesware.maintain.platform.security.CurrentUser;
import com.opesware.maintain.reliability.domain.FailureCode;
import com.opesware.maintain.reliability.infrastructure.FailureCodeRepository;
import com.opesware.maintain.safety.domain.InspectionTemplate;
import com.opesware.maintain.safety.infrastructure.InspectionTemplateRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

/**
 * Turns catalog selections into tenant-owned, editable records: ISO 14224 failure codes, class-specific
 * remedies, spare parts and checklists (inspection templates) when classes are selected; meters and
 * draft PM plans when an asset of a catalog class is registered. Idempotent: existing codes are kept.
 */
@Service
public class CatalogProvisioningService {
    private final CatalogService catalog;
    private final CrudService crud;
    private final TenantRepo tenants;
    private final TenantCatalogClassRepository selections;
    private final FailureCodeRepository failureCodes;
    private final PartRepository parts;
    private final InspectionTemplateRepository templates;
    private final MeterRepository meters;

    public CatalogProvisioningService(CatalogService catalog, CrudService crud, TenantRepo tenants, TenantCatalogClassRepository selections,
                                      FailureCodeRepository failureCodes, PartRepository parts, InspectionTemplateRepository templates,
                                      MeterRepository meters) {
        this.catalog = catalog;
        this.crud = crud;
        this.tenants = tenants;
        this.selections = selections;
        this.failureCodes = failureCodes;
        this.parts = parts;
        this.templates = templates;
        this.meters = meters;
    }

    public record Summary(int classesAdded, int checklists, int failureCodes, int spareParts) {}

    public List<String> selected(UUID tenantId) {
        return selections.findByTenantIdOrderByCreatedAtAsc(tenantId).stream().map(s -> s.assetClassId).toList();
    }

    /** Adds asset classes to the tenant and copies their reference data. Already-selected classes are ignored. */
    @Transactional
    public Summary select(UUID tenantId, Collection<String> classIds) {
        Set<String> wanted = new LinkedHashSet<>(classIds == null ? List.of() : classIds);
        for (String id : wanted) {
            if (catalog.assetClass(id).isEmpty()) throw ApiException.invalid("Unknown asset class " + id);
        }
        Set<String> have = new LinkedHashSet<>(selected(tenantId));
        List<String> added = wanted.stream().filter(id -> !have.contains(id)).toList();
        if (added.isEmpty()) return new Summary(0, 0, 0, 0);
        String lang = language(tenantId);
        String currency = tenants.findById(tenantId).map(t -> t.currency).orElse("XAF");
        return CurrentUser.runAsSystem(tenantId, () -> {
            Set<String> codes = failureCodes.findByTenantId(tenantId).stream().map(f -> f.code).collect(Collectors.toSet());
            Set<String> partNos = parts.findByTenantId(tenantId).stream().map(p -> p.partNo).collect(Collectors.toSet());
            Set<String> templateCodes = templates.findByTenantId(tenantId).stream().map(t -> t.code).collect(Collectors.toSet());
            int nCodes = dictionaries(codes, lang);
            int nTemplates = 0, nParts = 0;
            for (String id : added) {
                TenantCatalogClass s = new TenantCatalogClass();
                s.id = UUID.randomUUID();
                s.tenantId = tenantId;
                s.assetClassId = id;
                s.catalogVersion = catalog.version();
                s.createdAt = Instant.now();
                selections.save(s);
                JsonNode c = catalog.assetClass(id).orElseThrow();
                for (JsonNode pm : catalog.pmTemplates(id)) {
                    if (!templateCodes.add(pm.path("pm_id").asString())) continue;
                    InspectionTemplate t = new InspectionTemplate();
                    t.code = pm.path("pm_id").asString();
                    t.name = CatalogService.text(pm, "title", lang);
                    t.assetType = id;
                    t.templateVersion = 1;
                    t.status = "PUBLISHED";
                    t.questions = checklistLines(pm, lang).stream().collect(Collectors.joining("\n"));
                    crud.persistNew(t);
                    nTemplates++;
                }
                for (JsonNode fm : catalog.failureMatrices(id)) {
                    if (!codes.add(fm.path("matrix_id").asString())) continue;
                    FailureCode f = new FailureCode();
                    f.code = fm.path("matrix_id").asString();
                    f.name = cut(CatalogService.text(fm, "remedy", lang), 250);
                    f.codeType = "REMEDY";
                    f.assetType = id;
                    f.active = true;
                    crud.persistNew(f);
                    nCodes++;
                }
                for (JsonNode p : catalog.partsFor(id)) {
                    if (!partNos.add(p.path("sku").asString())) continue;
                    Part part = new Part();
                    part.partNo = p.path("sku").asString();
                    part.name = CatalogService.text(p, "name", lang);
                    part.category = CatalogService.text(c, "name", lang);
                    part.unit = p.path("unit").asString("PIECE");
                    // Catalog costs are in FCFA; keep them only where that is the tenant's currency (XAF, or XOF at par).
                    if ("XAF".equals(currency) || "XOF".equals(currency)) part.unitCost = BigDecimal.valueOf(p.path("estimated_unit_cost_xaf").asLong(0));
                    part.reorderPoint = BigDecimal.valueOf(p.path("recommended_min_stock").asInt(0));
                    part.criticalSpare = "CRITICAL".equals(c.path("criticality").asString());
                    part.status = "ACTIVE";
                    crud.persistNew(part);
                    nParts++;
                }
            }
            return new Summary(added.size(), nTemplates, nCodes, nParts);
        });
    }

    /** ISO 14224 failure modes and causes (mechanisms included as causes, prefixed) — once per tenant. */
    private int dictionaries(Set<String> codes, String lang) {
        int n = 0;
        JsonNode d = catalog.failureDictionaries();
        for (JsonNode m : d.path("failure_modes")) n += code(codes, m.path("mode_code").asString(), CatalogService.text(m, "name", lang), "PROBLEM");
        for (JsonNode m : d.path("failure_causes")) n += code(codes, m.path("cause_code").asString(), CatalogService.text(m, "name", lang), "CAUSE");
        for (JsonNode m : d.path("failure_mechanisms")) n += code(codes, "MECH-" + m.path("mech_code").asString(), CatalogService.text(m, "name", lang), "CAUSE");
        return n;
    }

    private int code(Set<String> codes, String code, String name, String type) {
        if (code.isBlank() || !codes.add(code)) return 0;
        FailureCode f = new FailureCode();
        f.code = code;
        f.name = cut(name, 250);
        f.codeType = type;
        f.active = true;
        crud.persistNew(f);
        return 1;
    }

    // ------------------------------------------------------------------ assets

    /** Fills an asset's type, category, criticality and lifespan from its catalog class (only blanks). */
    public void applyClass(Asset a) {
        if (a.assetClassId == null || a.assetClassId.isBlank()) return;
        JsonNode c = catalog.assetClass(a.assetClassId).orElseThrow(() -> ApiException.invalid("Unknown asset class " + a.assetClassId));
        String lang = language(CurrentUser.requireTenant());
        if (a.assetType == null) a.assetType = catalog.assetType(c);
        if (a.category == null || a.category.isBlank()) a.category = CatalogService.text(c, "name", lang);
        if (a.criticality == null) a.criticality = CatalogMapping.criticality(c.path("criticality").asString());
        if (a.expectedLifeYears == null && c.path("expected_lifespan_years").asInt(0) > 0) a.expectedLifeYears = c.path("expected_lifespan_years").asInt();
    }

    /** Creates the meters and draft PM plans for a newly registered asset of a catalog class. */
    public int createPlans(Asset a) {
        if (a.assetClassId == null || catalog.assetClass(a.assetClassId).isEmpty()) return 0;
        String lang = language(a.tenantId);
        int n = 0;
        Map<String, UUID> meterByUnit = new LinkedHashMap<>();
        for (Meter m : meters.findByAssetId(a.id)) meterByUnit.put(m.unit, m.id);
        for (JsonNode pm : catalog.pmTemplates(a.assetClassId)) {
            PmPlan p = new PmPlan();
            p.code = pm.path("pm_id").asString();
            p.name = cut(CatalogService.text(pm, "title", lang), 250);
            p.assetId = a.id;
            p.anchorDate = a.commissionedOn != null ? a.commissionedOn : LocalDate.now();
            int interval = pm.path("interval_value").asInt(0);
            String trigger = pm.path("trigger_type").asString("CALENDAR_DAYS");
            if ("ENGINE_HOURS".equals(trigger) || "KILOMETERS".equals(trigger)) {
                boolean hours = "ENGINE_HOURS".equals(trigger);
                String unit = hours ? "h" : "km";
                UUID meterId = meterByUnit.get(unit);
                if (meterId == null) {
                    Meter m = new Meter();
                    m.assetId = a.id;
                    m.name = hours ? ("FR".equals(lang) ? "Heures moteur" : "Engine hours") : ("FR".equals(lang) ? "Compteur kilométrique" : "Odometer");
                    m.meterType = "CUMULATIVE";
                    m.unit = unit;
                    m.status = "ACTIVE";
                    meterId = crud.persistNew(m).id;
                    meterByUnit.put(unit, meterId);
                }
                p.triggerType = "METER";
                p.meterId = meterId;
                p.meterInterval = BigDecimal.valueOf(Math.max(1, interval));
            } else {
                p.triggerType = "CALENDAR";
                p.intervalValue = Math.max(1, interval);
                p.intervalUnit = "DAY";
            }
            int mins = pm.path("estimated_duration_mins").asInt(0);
            if (mins > 0) p.estimatedHours = BigDecimal.valueOf(mins).divide(BigDecimal.valueOf(60), 2, RoundingMode.HALF_UP);
            p.priority = pm.path("regulatory_mandatory").asBoolean(false) ? "HIGH" : "PLANNED";
            p.workType = "PREVENTIVE";
            p.taskList = cut(taskList(pm, lang), 7900);
            crud.persistNew(p);
            n++;
        }
        return n;
    }

    // ------------------------------------------------------------------ text

    private List<String> checklistLines(JsonNode pm, String lang) {
        List<String> lines = new ArrayList<>();
        for (JsonNode step : pm.path("checklist")) {
            StringBuilder b = new StringBuilder(CatalogService.text(step, "text", lang));
            if ("NUMERIC".equals(step.path("input_type").asString())) {
                b.append(" [").append(num(step.path("min"))).append("–").append(num(step.path("max")));
                if (!step.path("unit").asString("").isBlank()) b.append(" ").append(step.path("unit").asString());
                b.append("]");
            }
            lines.add(b.toString());
        }
        return lines;
    }

    private String taskList(JsonNode pm, String lang) {
        boolean fr = "FR".equals(lang);
        StringBuilder b = new StringBuilder();
        int i = 1;
        for (String line : checklistLines(pm, lang)) b.append(i++).append(". ").append(line).append('\n');
        JsonNode craft = catalog.craft(pm.path("craft_id").asString());
        if (craft != null) b.append('\n').append(fr ? "Métier : " : "Craft: ").append(CatalogService.text(craft, "name", lang)).append('\n');
        List<String> tools = new ArrayList<>();
        for (JsonNode t : pm.path("required_tool_ids")) { JsonNode tool = catalog.tool(t.asString()); if (tool != null) tools.add(CatalogService.text(tool, "name", lang)); }
        if (!tools.isEmpty()) b.append(fr ? "Outils : " : "Tools: ").append(String.join(", ", tools)).append('\n');
        for (JsonNode s : pm.path("safety_protocol_ids")) {
            JsonNode p = catalog.protocol(s.asString());
            if (p == null) continue;
            b.append(fr ? "Sécurité : " : "Safety: ").append(CatalogService.text(p, "name", lang))
                    .append(" (").append(p.path("permit_type").asString()).append(")\n");
            String ppe = joined(p.path(fr ? "mandatory_ppe_fr" : "mandatory_ppe_en"));
            if (!ppe.isBlank()) b.append(fr ? "  EPI : " : "  PPE: ").append(ppe).append('\n');
            String iso = joined(p.path(fr ? "isolation_steps_fr" : "isolation_steps_en"));
            if (!iso.isBlank()) b.append(fr ? "  Consignation : " : "  Isolation: ").append(iso).append('\n');
        }
        List<String> parts = new ArrayList<>();
        for (JsonNode r : pm.path("required_parts")) {
            JsonNode part = catalog.part(r.path("part_id").asString());
            if (part != null) parts.add(r.path("qty").asInt(1) + " × " + CatalogService.text(part, "name", lang) + " (" + part.path("sku").asString() + ")");
        }
        if (!parts.isEmpty()) b.append(fr ? "Pièces : " : "Parts: ").append(String.join("; ", parts)).append('\n');
        List<String> sup = new ArrayList<>();
        for (JsonNode s : pm.path("supersedes_pm_ids")) sup.add(s.asString());
        if (!sup.isEmpty()) b.append(fr ? "Remplace : " : "Supersedes: ").append(String.join(", ", sup)).append('\n');
        if (pm.path("regulatory_mandatory").asBoolean(false)) b.append(fr ? "Obligation réglementaire." : "Regulatory requirement.").append('\n');
        b.append(fr ? "Source : catalogue OPES " : "Source: OPES catalog ").append(pm.path("pm_id").asString());
        return b.toString();
    }

    private static String joined(JsonNode n) {
        if (n.isArray()) {
            List<String> l = new ArrayList<>();
            for (JsonNode x : n) l.add(x.asString());
            return String.join("; ", l);
        }
        return n.asString("");
    }

    private static String num(JsonNode n) {
        if (n.isMissingNode() || n.isNull()) return "?";
        BigDecimal d = n.decimalValue().stripTrailingZeros();
        return d.toPlainString();
    }

    private static String cut(String s, int max) {
        return s == null ? null : s.length() > max ? s.substring(0, max) : s;
    }

    private String language(UUID tenantId) {
        return tenants.findById(tenantId).map((Tenant t) -> t.language).orElse("EN");
    }
}
