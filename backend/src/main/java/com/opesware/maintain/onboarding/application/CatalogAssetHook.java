package com.opesware.maintain.onboarding.application;

import com.opesware.maintain.asset.domain.Asset;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.ResourceHook;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/**
 * Assets registered against a catalog class: blanks are filled from the class on create, the class's spec
 * values must be valid JSON, and the class's meters and draft PM plans are created after the asset is saved.
 */
@Component
public class CatalogAssetHook implements ResourceHook {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final CatalogProvisioningService provisioning;

    public CatalogAssetHook(CatalogProvisioningService provisioning) {
        this.provisioning = provisioning;
    }

    @Override
    public String path() { return "assets"; }

    @Override
    public void beforeCreate(Object e) {
        Asset a = (Asset) e;
        checkSpecs(a);
        provisioning.applyClass(a);
    }

    @Override
    public void beforeUpdate(Object e) {
        Asset a = (Asset) e;
        checkSpecs(a);
        provisioning.applyClass(a);
    }

    @Override
    public void afterSave(Object e, boolean created) {
        if (created) provisioning.createPlans((Asset) e);
    }

    private static void checkSpecs(Asset a) {
        if (a.specs == null || a.specs.isBlank()) return;
        try {
            if (!JSON.readTree(a.specs).isObject()) throw new IllegalArgumentException();
        } catch (RuntimeException ex) {
            throw ApiException.invalid("Specifications must be a JSON object");
        }
    }
}
