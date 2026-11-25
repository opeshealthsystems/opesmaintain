package com.opesware.maintain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.opesware.maintain.asset.domain.Asset;
import com.opesware.maintain.asset.infrastructure.MeterRepository;
import com.opesware.maintain.inventory.infrastructure.PartRepository;
import com.opesware.maintain.maintenance.domain.PmPlan;
import com.opesware.maintain.onboarding.application.CatalogService;
import com.opesware.maintain.onboarding.application.OnboardingService;
import com.opesware.maintain.onboarding.application.SignupService;
import com.opesware.maintain.onboarding.application.TenantProvisioningService;
import com.opesware.maintain.organization.infrastructure.SiteRepository;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.infrastructure.TenantRepo;
import com.opesware.maintain.platform.security.CurrentUser;
import com.opesware.maintain.platform.security.Principal;
import com.opesware.maintain.reliability.infrastructure.FailureCodeRepository;
import com.opesware.maintain.safety.infrastructure.InspectionTemplateRepository;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import tools.jackson.databind.JsonNode;

@SpringBootTest
@ActiveProfiles("test")
class CatalogOnboardingTest {
    private static final Set<String> ASSET_TYPES = Set.of("MEDICAL_DEVICE", "HVAC", "ELECTRICAL", "PLUMBING", "GENERATOR", "VEHICLE",
            "PRODUCTION", "IT", "LABORATORY", "BUILDING", "OTHER");

    @Autowired CatalogService catalog;
    @Autowired OnboardingService onboarding;
    @Autowired SignupService signup;
    @Autowired TenantRepo tenants;
    @Autowired CrudService crud;
    @Autowired SiteRepository sites;
    @Autowired FailureCodeRepository failureCodes;
    @Autowired PartRepository parts;
    @Autowired InspectionTemplateRepository templates;
    @Autowired MeterRepository meters;

    @AfterEach
    void clear() {
        CurrentUser.clear();
    }

    private TenantProvisioningService.Provisioned newWorkspace(String role) {
        String email = "cat-" + UUID.randomUUID() + "@example.com";
        Map<String, String> f = new HashMap<>(Map.of("email", email, "fullName", "Cat Owner", "companyName", "Transports Ndjock",
                "country", "CM", "industry", "FLEET_LOGISTICS", "password", "Catalog2026x"));
        TenantProvisioningService.Provisioned p = signup.verify(email, signup.start(f).devCode());
        CurrentUser.set(new Principal(p.userId(), p.tenantId(), email, "Cat Owner", role, null));
        return p;
    }

    @Test
    void catalogLoadsAndEveryClassMapsToAPlatformAssetType() {
        Map<String, Object> view = catalog.view("FR");
        assertThat(catalog.version()).startsWith("2.");
        List<?> sectors = (List<?>) view.get("sectors");
        assertThat(sectors).hasSize(5);
        int classes = 0;
        for (Object s : sectors) for (Object y : (List<?>) ((Map<?, ?>) s).get("systems")) for (Object c : (List<?>) ((Map<?, ?>) y).get("assetClasses")) {
            classes++;
            assertThat(ASSET_TYPES).contains((String) ((Map<?, ?>) c).get("assetType"));
            assertThat((String) ((Map<?, ?>) c).get("name")).isNotBlank();
        }
        assertThat(classes).isEqualTo(42);
        assertThat(catalog.classDetail("AC-HLTH-001", "EN").orElseThrow().get("pmProgramme")).asList().isNotEmpty();
    }

    @Test
    void onboardingCopiesCatalogDataIntoTheWorkspaceOnce() {
        TenantProvisioningService.Provisioned p = newWorkspace("ADMIN");
        assertThat(onboarding.state().get("step")).isEqualTo("COMPANY");

        onboarding.company(Map.of("companyName", "Transports Ndjock SA", "sector", "FLEET_LOGISTICS", "currency", "XAF", "language", "EN"));
        assertThat(onboarding.state().get("step")).isEqualTo("SITES");
        onboarding.addSites(Map.of("sites", List.of(Map.of("name", "Dépôt Bonabéri", "city", "Douala"), Map.of("name", "Dépôt Bonabéri", "city", "Douala"))));
        assertThat(sites.findByTenantId(p.tenantId())).extracting(s -> s.code).containsExactlyInAnyOrder("DEPOTB", "DEPOTB2");
        assertThat(onboarding.state().get("step")).isEqualTo("ASSETS");

        Map<String, Object> r = onboarding.selectClasses(Map.of("assetClasses", List.of("AC-FLT-001", "AC-HLTH-001")));
        @SuppressWarnings("unchecked") Map<String, Integer> added = (Map<String, Integer>) r.get("added");
        assertThat(added.get("assetClasses")).isEqualTo(2);
        assertThat(added.get("checklists")).isEqualTo(catalog.pmTemplates("AC-FLT-001").size() + catalog.pmTemplates("AC-HLTH-001").size());
        assertThat(failureCodes.findByTenantId(p.tenantId())).anyMatch(f -> "FTS".equals(f.code) && "PROBLEM".equals(f.codeType));
        assertThat(templates.findByTenantId(p.tenantId())).allMatch(t -> t.questions != null && !t.questions.isBlank());
        for (JsonNode part : catalog.partsFor("AC-HLTH-001")) {
            assertThat(parts.findByTenantId(p.tenantId())).anyMatch(x -> x.partNo.equals(part.path("sku").asString()) && x.unitCost != null);
        }

        int codes = failureCodes.findByTenantId(p.tenantId()).size();
        Map<String, Object> again = onboarding.selectClasses(Map.of("assetClasses", List.of("AC-FLT-001")));
        assertThat(((Map<?, ?>) again.get("added")).get("assetClasses")).isEqualTo(0);
        assertThat(failureCodes.findByTenantId(p.tenantId())).hasSize(codes);
        assertThatThrownBy(() -> onboarding.selectClasses(Map.of("assetClasses", List.of("AC-NOPE"))))
                .isInstanceOf(ApiException.class);

        onboarding.complete();
        assertThat(onboarding.state().get("completed")).isEqualTo(true);
        assertThat(tenants.findById(p.tenantId()).orElseThrow().onboardedAt).isNotNull();
    }

    @Test
    void assetFromCatalogClassGetsItsDetailsMetersAndDraftPmPlans() {
        TenantProvisioningService.Provisioned p = newWorkspace("ADMIN");
        onboarding.addSites(Map.of("sites", List.of(Map.of("name", "Garage Central", "city", "Yaoundé"))));
        UUID siteId = sites.findByTenantId(p.tenantId()).get(0).id;

        Asset a = new Asset();
        a.tag = "TRK-001";
        a.name = "Mercedes Actros CE-123-AB";
        a.siteId = siteId;
        a.assetClassId = "AC-FLT-001";
        a.specs = "{\"plate_number\":\"CE-123-AB\"}";
        Asset saved = crud.persistNew(a);

        assertThat(saved.assetType).isEqualTo("VEHICLE");
        assertThat(saved.criticality).isEqualTo("A_CRITICAL");
        assertThat(saved.category).isNotBlank();
        List<PmPlan> plans = crud.repo(PmPlan.class).findAll().stream().map(x -> (PmPlan) x).filter(x -> saved.id.equals(x.assetId)).toList();
        assertThat(plans).hasSize(catalog.pmTemplates("AC-FLT-001").size()).allMatch(x -> "DRAFT".equals(x.status));
        assertThat(plans).allMatch(x -> x.taskList != null && x.taskList.contains("1. "));
        boolean meterBased = catalog.pmTemplates("AC-FLT-001").stream().anyMatch(t -> !"CALENDAR_DAYS".equals(t.path("trigger_type").asString()));
        if (meterBased) {
            assertThat(meters.findByAssetId(saved.id)).isNotEmpty();
            assertThat(plans).anyMatch(x -> "METER".equals(x.triggerType) && x.meterId != null);
        }

        Asset bad = new Asset();
        bad.tag = "X-1"; bad.name = "Bad"; bad.siteId = siteId; bad.assetClassId = "AC-FLT-001"; bad.specs = "not json";
        assertThatThrownBy(() -> crud.persistNew(bad)).isInstanceOf(ApiException.class);
    }

    @Test
    void onlyAdministratorsAndManagersCanChangeSetup() {
        newWorkspace("TECHNICIAN");
        assertThatThrownBy(() -> onboarding.company(Map.of("sector", "FLEET_LOGISTICS"))).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> onboarding.selectClasses(Map.of("assetClasses", List.of("AC-FLT-001")))).isInstanceOf(ApiException.class);
    }

    @Test
    void selectionsStayInsideTheirWorkspace() {
        TenantProvisioningService.Provisioned a = newWorkspace("ADMIN");
        onboarding.selectClasses(Map.of("assetClasses", List.of("AC-HLTH-001")));
        CurrentUser.clear();
        TenantProvisioningService.Provisioned b = newWorkspace("ADMIN");
        assertThat((List<?>) onboarding.state().get("assetClasses")).isEmpty();
        assertThat(failureCodes.findByTenantId(b.tenantId())).isEmpty();
        assertThat(failureCodes.findByTenantId(a.tenantId())).isNotEmpty();
    }
}
