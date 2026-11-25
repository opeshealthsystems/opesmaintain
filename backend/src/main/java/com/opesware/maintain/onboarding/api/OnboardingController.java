package com.opesware.maintain.onboarding.api;

import com.opesware.maintain.onboarding.application.CatalogProvisioningService;
import com.opesware.maintain.onboarding.application.CatalogService;
import com.opesware.maintain.onboarding.application.OnboardingService;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.domain.Tenant;
import com.opesware.maintain.platform.infrastructure.TenantRepo;
import com.opesware.maintain.platform.security.CurrentUser;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Workspace set-up wizard and the OPES master catalog (signed-in users). */
@RestController
@RequestMapping("/api/v1")
public class OnboardingController {
    private final OnboardingService onboarding;
    private final CatalogService catalog;
    private final CatalogProvisioningService provisioning;
    private final TenantRepo tenants;

    public OnboardingController(OnboardingService onboarding, CatalogService catalog, CatalogProvisioningService provisioning, TenantRepo tenants) {
        this.onboarding = onboarding;
        this.catalog = catalog;
        this.provisioning = provisioning;
        this.tenants = tenants;
    }

    @GetMapping("/onboarding")
    public Map<String, Object> state() { return onboarding.state(); }

    @PutMapping("/onboarding/company")
    public Map<String, Object> company(@RequestBody Map<String, Object> body) { return onboarding.company(body); }

    @PostMapping("/onboarding/sites")
    public Map<String, Object> sites(@RequestBody Map<String, Object> body) { return onboarding.addSites(body); }

    @PutMapping("/onboarding/asset-classes")
    public Map<String, Object> assetClasses(@RequestBody Map<String, Object> body) { return onboarding.selectClasses(body); }

    @PostMapping("/onboarding/complete")
    public Map<String, Object> complete() { return onboarding.complete(); }

    /** The whole catalog (sectors → systems → asset classes) in the requested or the workspace language. */
    @GetMapping("/catalog")
    public Map<String, Object> catalog(@RequestParam(required = false) String lang) {
        return catalog.view(lang != null ? lang : language());
    }

    /** The asset classes this workspace manages, with their spec forms — used by the asset form. */
    @GetMapping("/catalog/selected")
    public List<Map<String, Object>> selected(@RequestParam(required = false) String lang) {
        String l = lang != null ? lang : language();
        List<Map<String, Object>> out = new ArrayList<>();
        for (String id : provisioning.selected(CurrentUser.requireTenant())) catalog.assetClass(id).ifPresent(c -> out.add(catalog.classSummary(c, l)));
        return out;
    }

    @GetMapping("/catalog/classes/{id}")
    public Map<String, Object> assetClass(@PathVariable String id, @RequestParam(required = false) String lang) {
        String l = lang != null ? lang : language();
        return catalog.classDetail(id, l).orElseThrow(() -> ApiException.notFound("Asset class " + id));
    }

    private String language() {
        return tenants.findById(CurrentUser.requireTenant()).map((Tenant t) -> t.language).orElse("EN");
    }
}
