package com.opesware.maintain.onboarding.application;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The OPES master maintenance catalog (sectors, systems, asset classes, PM templates, ISO 14224 failure
 * dictionaries, crafts, tools, safety protocols, spare parts). Read-only, global, loaded once from
 * {@code catalog/opes_maintenance_catalog.json}. Tenants receive their own editable copies of what they select.
 */
@Service
public class CatalogService {
    static final String RESOURCE = "catalog/opes_maintenance_catalog.json";
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final JsonNode root;
    private final Map<String, JsonNode> sectors = new LinkedHashMap<>();
    private final Map<String, JsonNode> systems = new LinkedHashMap<>();
    private final Map<String, JsonNode> classes = new LinkedHashMap<>();
    private final Map<String, JsonNode> crafts = new LinkedHashMap<>();
    private final Map<String, JsonNode> tools = new LinkedHashMap<>();
    private final Map<String, JsonNode> protocols = new LinkedHashMap<>();
    private final Map<String, JsonNode> parts = new LinkedHashMap<>();
    private final Map<String, List<JsonNode>> pmByClass = new LinkedHashMap<>();
    private final Map<String, List<JsonNode>> partsByClass = new LinkedHashMap<>();
    private final Map<String, List<JsonNode>> matricesByClass = new LinkedHashMap<>();

    public CatalogService() {
        try (InputStream in = new ClassPathResource(RESOURCE).getInputStream()) {
            root = JSON.readTree(in);
        } catch (IOException e) {
            throw new IllegalStateException("Cannot load " + RESOURCE, e);
        }
        index("sectors", "sector_id", sectors);
        index("functional_systems", "system_id", systems);
        index("asset_classes", "asset_class_id", classes);
        index("crafts_and_roles", "craft_id", crafts);
        index("special_tools", "tool_id", tools);
        index("safety_protocols", "protocol_id", protocols);
        index("spare_parts", "part_id", parts);
        group("pm_templates", pmByClass);
        group("spare_parts", partsByClass);
        group("asset_failure_matrices", matricesByClass);
    }

    private void index(String array, String key, Map<String, JsonNode> into) {
        for (JsonNode n : root.path(array)) into.put(n.path(key).asString(), n);
    }

    private void group(String array, Map<String, List<JsonNode>> into) {
        for (JsonNode n : root.path(array)) into.computeIfAbsent(n.path("asset_class_id").asString(), k -> new ArrayList<>()).add(n);
    }

    /** Text in the tenant's language ("EN"/"FR"), falling back to English. */
    public static String text(JsonNode n, String base, String lang) {
        String fr = n.path(base + "_fr").asString("");
        return "FR".equalsIgnoreCase(lang) && !fr.isBlank() ? fr : n.path(base + "_en").asString("");
    }

    /** The platform asset type (MEDICAL_DEVICE, HVAC, ...) for a catalog asset class. */
    public String assetType(JsonNode c) {
        JsonNode sys = systems.get(c.path("system_id").asString());
        return CatalogMapping.assetType(c, sys == null ? "" : sys.path("code").asString());
    }

    public String version() { return root.path("schema_metadata").path("version").asString(""); }
    public boolean isSector(String code) { return sectors.values().stream().anyMatch(s -> s.path("code").asString().equals(code)); }
    public Optional<JsonNode> sectorByCode(String code) { return sectors.values().stream().filter(s -> s.path("code").asString().equals(code)).findFirst(); }
    public Optional<JsonNode> assetClass(String id) { return Optional.ofNullable(id == null ? null : classes.get(id)); }
    public JsonNode system(String id) { return systems.get(id); }
    public JsonNode sector(String id) { return sectors.get(id); }
    public JsonNode craft(String id) { return crafts.get(id); }
    public JsonNode tool(String id) { return tools.get(id); }
    public JsonNode protocol(String id) { return protocols.get(id); }
    public JsonNode part(String id) { return parts.get(id); }
    public List<JsonNode> pmTemplates(String classId) { return pmByClass.getOrDefault(classId, Collections.emptyList()); }
    public List<JsonNode> partsFor(String classId) { return partsByClass.getOrDefault(classId, Collections.emptyList()); }
    public List<JsonNode> failureMatrices(String classId) { return matricesByClass.getOrDefault(classId, Collections.emptyList()); }
    public JsonNode failureDictionaries() { return root.path("iso14224_failure_dictionaries"); }

    /** Compact catalog for pickers: sectors → systems → asset classes, in one language. */
    public Map<String, Object> view(String lang) {
        String l = lang == null ? "EN" : lang.toUpperCase(Locale.ROOT);
        List<Map<String, Object>> out = new ArrayList<>();
        for (JsonNode s : sectors.values()) {
            Map<String, Object> sm = new LinkedHashMap<>();
            sm.put("id", s.path("sector_id").asString());
            sm.put("code", s.path("code").asString());
            sm.put("name", text(s, "name", l));
            List<Map<String, Object>> sys = new ArrayList<>();
            for (JsonNode y : systems.values()) {
                if (!y.path("sector_id").asString().equals(s.path("sector_id").asString())) continue;
                Map<String, Object> ym = new LinkedHashMap<>();
                ym.put("id", y.path("system_id").asString());
                ym.put("code", y.path("code").asString());
                ym.put("name", text(y, "name", l));
                List<Map<String, Object>> cls = new ArrayList<>();
                for (JsonNode c : classes.values()) {
                    if (c.path("system_id").asString().equals(y.path("system_id").asString())) cls.add(classSummary(c, l));
                }
                ym.put("assetClasses", cls);
                sys.add(ym);
            }
            sm.put("systems", sys);
            out.add(sm);
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("version", version());
        m.put("sectors", out);
        return m;
    }

    public Map<String, Object> classSummary(JsonNode c, String lang) {
        String id = c.path("asset_class_id").asString();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id);
        m.put("name", text(c, "name", lang));
        m.put("standardCode", c.path("standard_code").asString(""));
        m.put("criticality", c.path("criticality").asString(""));
        m.put("riskCategory", c.path("risk_category").asString(""));
        m.put("expectedLifespanYears", c.path("expected_lifespan_years").asInt(0));
        m.put("assetType", assetType(c));
        m.put("pmTemplates", pmTemplates(id).size());
        m.put("spareParts", partsFor(id).size());
        m.put("failureModes", failureMatrices(id).size());
        List<Map<String, Object>> specs = new ArrayList<>();
        for (JsonNode f : c.path("specs_schema")) {
            Map<String, Object> fm = new LinkedHashMap<>();
            fm.put("key", f.path("key").asString());
            fm.put("label", text(f, "label", lang));
            fm.put("type", f.path("type").asString("string"));
            fm.put("required", f.path("required").asBoolean(false));
            specs.add(fm);
        }
        m.put("specs", specs);
        List<String> components = new ArrayList<>();
        for (JsonNode sc : c.path("sub_components")) components.add(text(sc, "name", lang));
        m.put("components", components);
        return m;
    }

    /** One class with its PM programme, spare parts and failure modes, for previews before selecting it. */
    public Optional<Map<String, Object>> classDetail(String id, String lang) {
        return assetClass(id).map(c -> {
            Map<String, Object> m = classSummary(c, lang);
            JsonNode sys = systems.get(c.path("system_id").asString());
            if (sys != null) m.put("system", text(sys, "name", lang));
            List<Map<String, Object>> pms = new ArrayList<>();
            for (JsonNode p : pmTemplates(id)) {
                Map<String, Object> pm = new LinkedHashMap<>();
                pm.put("id", p.path("pm_id").asString());
                pm.put("title", text(p, "title", lang));
                pm.put("level", p.path("pm_hierarchy_level").asString(""));
                pm.put("trigger", p.path("trigger_type").asString(""));
                pm.put("interval", p.path("interval_value").asInt(0));
                pm.put("durationMins", p.path("estimated_duration_mins").asInt(0));
                pm.put("regulatory", p.path("regulatory_mandatory").asBoolean(false));
                JsonNode craft = craft(p.path("craft_id").asString());
                pm.put("craft", craft == null ? null : text(craft, "name", lang));
                List<String> steps = new ArrayList<>();
                for (JsonNode st : p.path("checklist")) steps.add(text(st, "text", lang));
                pm.put("checklist", steps);
                pms.add(pm);
            }
            m.put("pmProgramme", pms);
            List<Map<String, Object>> sp = new ArrayList<>();
            for (JsonNode p : partsFor(id)) {
                Map<String, Object> pm = new LinkedHashMap<>();
                pm.put("sku", p.path("sku").asString());
                pm.put("name", text(p, "name", lang));
                pm.put("unit", p.path("unit").asString(""));
                pm.put("minStock", p.path("recommended_min_stock").asInt(0));
                pm.put("costXaf", p.path("estimated_unit_cost_xaf").asLong(0));
                sp.add(pm);
            }
            m.put("parts", sp);
            return m;
        });
    }

    /** Sectors for the sign-up form: code and name. */
    public List<Map<String, Object>> sectorList(String lang) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (JsonNode s : sectors.values()) out.add(Map.of("code", s.path("code").asString(), "name", text(s, "name", lang)));
        return out;
    }
}
