package com.opesware.maintain.onboarding.application;

import com.opesware.maintain.organization.domain.Organization;
import com.opesware.maintain.organization.domain.Site;
import com.opesware.maintain.organization.infrastructure.OrganizationRepository;
import com.opesware.maintain.organization.infrastructure.SiteRepository;
import com.opesware.maintain.platform.application.Access;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.domain.Tenant;
import com.opesware.maintain.platform.infrastructure.TenantRepo;
import com.opesware.maintain.platform.security.CurrentUser;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Guided set-up of a new workspace: company profile and sector → sites → asset classes from the master
 * catalog → done. Steps can be revisited; only administrators and managers may run it.
 */
@Service
public class OnboardingService {
    public static final List<String> STEPS = List.of("COMPANY", "SITES", "ASSETS", "DONE");
    private static final Set<String> CURRENCIES = Set.of("XAF", "XOF", "NGN", "GHS", "KES", "RWF", "CDF", "ZAR", "EUR", "GBP", "USD", "CAD");

    private final TenantRepo tenants;
    private final OrganizationRepository organizations;
    private final SiteRepository sites;
    private final CrudService crud;
    private final CatalogService catalog;
    private final CatalogProvisioningService provisioning;

    public OnboardingService(TenantRepo tenants, OrganizationRepository organizations, SiteRepository sites, CrudService crud,
                             CatalogService catalog, CatalogProvisioningService provisioning) {
        this.tenants = tenants;
        this.organizations = organizations;
        this.sites = sites;
        this.crud = crud;
        this.catalog = catalog;
        this.provisioning = provisioning;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> state() {
        Tenant t = tenant();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("step", t.onboardingStep == null ? "DONE" : t.onboardingStep);
        m.put("completed", t.onboardingStep == null);
        m.put("companyName", owner(t.id).map(o -> o.name).orElse(t.legalName));
        m.put("country", t.country);
        m.put("timeZone", t.timeZone);
        m.put("currency", t.currency);
        m.put("language", t.language);
        m.put("sector", catalog.isSector(t.industry) ? t.industry : null);
        m.put("plan", t.plan);
        m.put("trialEndsAt", t.trialEndsAt == null ? null : t.trialEndsAt.toString());
        List<Map<String, Object>> siteList = new ArrayList<>();
        for (Site s : sites.findByTenantId(t.id)) {
            Map<String, Object> sm = new LinkedHashMap<>();
            sm.put("id", s.id); sm.put("code", s.code); sm.put("name", s.name); sm.put("city", s.city);
            siteList.add(sm);
        }
        m.put("sites", siteList);
        m.put("assetClasses", provisioning.selected(t.id));
        m.put("catalogVersion", catalog.version());
        return m;
    }

    @Transactional
    public Map<String, Object> company(Map<String, Object> body) {
        requireSetupRole();
        Tenant t = tenant();
        String name = str(body.get("companyName"));
        if (name != null) {
            if (name.length() < 2 || name.length() > 160) throw ApiException.invalid("Enter your company name");
            t.legalName = name;
            owner(t.id).ifPresent(o -> { o.name = name; o.legalName = name; organizations.save(o); });
        }
        String sector = str(body.get("sector"));
        if (sector != null) {
            if (!catalog.isSector(sector) && !"OTHER".equals(sector)) throw ApiException.invalid("Choose your sector");
            t.industry = sector;
        }
        String tz = str(body.get("timeZone"));
        if (tz != null) {
            try { ZoneId.of(tz); } catch (DateTimeException e) { throw ApiException.invalid("Unknown time zone " + tz); }
            t.timeZone = tz;
        }
        String cur = str(body.get("currency"));
        if (cur != null) {
            cur = cur.toUpperCase(Locale.ROOT);
            if (!CURRENCIES.contains(cur)) throw ApiException.invalid("Unsupported currency " + cur);
            t.currency = cur;
        }
        String lang = str(body.get("language"));
        if (lang != null) t.language = "FR".equalsIgnoreCase(lang) ? "FR" : "EN";
        advance(t, "SITES");
        tenants.save(t);
        return state();
    }

    @Transactional
    @SuppressWarnings("unchecked")
    public Map<String, Object> addSites(Map<String, Object> body) {
        requireSetupRole();
        Tenant t = tenant();
        Object raw = body.get("sites");
        if (!(raw instanceof List<?> list) || list.isEmpty()) throw ApiException.invalid("Add at least one site");
        if (list.size() > 50) throw ApiException.invalid("Add at most 50 sites at a time");
        Set<String> codes = new HashSet<>();
        for (Site s : sites.findByTenantId(t.id)) codes.add(s.code);
        UUID ownerId = owner(t.id).map(o -> o.id).orElse(null);
        for (Object o : list) {
            Map<String, Object> in = (Map<String, Object>) o;
            String name = str(in.get("name"));
            if (name == null || name.length() < 2 || name.length() > 160) throw ApiException.invalid("Each site needs a name");
            Site s = new Site();
            s.name = name;
            s.city = str(in.get("city"));
            s.address = str(in.get("address"));
            s.country = t.country;
            s.timeZone = str(in.get("timeZone")) != null ? str(in.get("timeZone")) : t.timeZone != null ? t.timeZone : "UTC";
            s.organizationId = ownerId;
            s.status = "ACTIVE";
            s.code = uniqueCode(str(in.get("code")) != null ? str(in.get("code")) : name, codes);
            crud.persistNew(s);
        }
        advance(t, "ASSETS");
        tenants.save(t);
        return state();
    }

    @Transactional
    @SuppressWarnings("unchecked")
    public Map<String, Object> selectClasses(Map<String, Object> body) {
        requireSetupRole();
        Tenant t = tenant();
        Object raw = body.get("assetClasses");
        if (!(raw instanceof List<?> ids)) throw ApiException.invalid("Choose the kinds of equipment you manage");
        CatalogProvisioningService.Summary s = provisioning.select(t.id, (List<String>) ids);
        Map<String, Object> m = state();
        m.put("added", Map.of("assetClasses", s.classesAdded(), "checklists", s.checklists(), "failureCodes", s.failureCodes(), "spareParts", s.spareParts()));
        return m;
    }

    @Transactional
    public Map<String, Object> complete() {
        requireSetupRole();
        Tenant t = tenant();
        t.onboardingStep = null;
        if (t.onboardedAt == null) t.onboardedAt = Instant.now();
        tenants.save(t);
        return state();
    }

    // ------------------------------------------------------------------ helpers

    private void advance(Tenant t, String to) {
        if (t.onboardingStep == null) return; // finished workspaces stay finished
        if (STEPS.indexOf(to) > STEPS.indexOf(t.onboardingStep)) t.onboardingStep = to;
    }

    private Tenant tenant() {
        UUID id = CurrentUser.requireTenant();
        return tenants.findById(id).orElseThrow(() -> ApiException.notFound("Workspace"));
    }

    private java.util.Optional<Organization> owner(UUID tenantId) {
        return organizations.findByTenantId(tenantId).stream().filter(o -> "OWNER".equals(o.kind)).findFirst();
    }

    private static void requireSetupRole() {
        Access.requireRole("ADMIN", "MANAGER");
    }

    private static String uniqueCode(String base, Set<String> taken) {
        String b = java.text.Normalizer.normalize(base, java.text.Normalizer.Form.NFD).replaceAll("\\p{M}", "")
                .toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]+", "");
        if (b.isEmpty()) b = "SITE";
        if (b.length() > 6) b = b.substring(0, 6);
        String code = b;
        for (int i = 2; !taken.add(code); i++) code = b + i;
        return code;
    }

    private static String str(Object o) {
        if (o == null) return null;
        String s = o.toString().trim();
        return s.isEmpty() ? null : s;
    }
}
