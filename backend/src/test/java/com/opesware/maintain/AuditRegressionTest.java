package com.opesware.maintain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.opesware.maintain.asset.domain.Asset;
import com.opesware.maintain.commercial.domain.Customer;
import com.opesware.maintain.identity.domain.AppUser;
import com.opesware.maintain.identity.domain.Delegation;
import com.opesware.maintain.integration.application.WebhookUrlPolicy;
import com.opesware.maintain.maintenance.application.WorkOrderService;
import com.opesware.maintain.maintenance.domain.WorkOrder;
import com.opesware.maintain.organization.domain.Organization;
import com.opesware.maintain.organization.domain.ServiceGrant;
import com.opesware.maintain.organization.domain.Site;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.domain.Tenant;
import com.opesware.maintain.platform.infrastructure.TenantRepo;
import com.opesware.maintain.platform.security.CurrentUser;
import com.opesware.maintain.platform.security.Principal;
import com.opesware.maintain.platform.security.ScopeResolver;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/** Regression tests for defects found in the platform audit. */
@SpringBootTest
@ActiveProfiles("test")
class AuditRegressionTest {
    @Autowired CrudService crud;
    @Autowired TenantRepo tenants;
    @Autowired WorkOrderService workOrders;
    @Autowired ScopeResolver scopes;

    UUID tenant;
    Site siteA;
    Site siteB;
    Asset assetA;
    Asset assetB;

    @BeforeEach
    void setUp() {
        Tenant t = new Tenant();
        t.id = UUID.randomUUID(); t.code = "audit-" + t.id; t.legalName = "Audit"; t.status = "ACTIVE";
        tenant = tenants.save(t).id;
        as("seed", "ADMIN", null, () -> {
            siteA = site("A"); siteB = site("B");
            assetA = asset("A-1", siteA.id, null); assetB = asset("B-1", siteB.id, null);
            return null;
        });
    }

    @AfterEach
    void clear() {
        CurrentUser.clear();
    }

    @Test
    void technicianCannotRemovePermitRequirement() {
        WorkOrder wo = as("seed", "ADMIN", null, () -> {
            WorkOrder w = new WorkOrder();
            w.title = "Isolate"; w.workType = "CORRECTIVE"; w.priority = "HIGH"; w.siteId = siteA.id; w.permitRequired = true;
            return crud.persistNew(w);
        });
        as("tech", "TECHNICIAN", null, () -> {
            assertThatThrownBy(() -> crud.update("work-orders", wo.id, Map.of("permitRequired", false), String.valueOf(crud.get("work-orders", wo.id).get("version"))))
                    .satisfies(e -> assertThat(((ApiException) e).status()).isEqualTo(403));
            return null;
        });
        as("manager", "MANAGER", null, () -> crud.update("work-orders", wo.id, Map.of("permitRequired", false), String.valueOf(crud.get("work-orders", wo.id).get("version"))));
    }

    @Test
    void customerCannotReferenceAnotherCustomersAsset() {
        UUID[] ids = as("seed", "ADMIN", null, () -> {
            Customer c1 = customer("C1"); Customer c2 = customer("C2");
            assetA.customerId = c1.id; crud.saveDomain(assetA, "UPDATE", null, Map.of());
            assetB.customerId = c2.id; crud.saveDomain(assetB, "UPDATE", null, Map.of());
            return new UUID[]{c1.id};
        });
        as("cust", "CUSTOMER", ids[0], () -> {
            Map<String, Object> body = new HashMap<>(Map.of("title", "x", "description", "y", "priority", "LOW", "siteId", siteB.id.toString(), "assetId", assetB.id.toString()));
            assertThatThrownBy(() -> crud.create("maintenance-requests", body, null)).satisfies(e -> assertThat(((ApiException) e).status()).isEqualTo(400));
            body.put("assetId", assetA.id.toString());
            assertThat(crud.create("maintenance-requests", body, null).get("assetId")).isEqualTo(assetA.id.toString());
            return null;
        });
    }

    @Test
    void contractorSeesOnlyGrantedSitesAndLosesAccessWhenGrantExpires() {
        AppUser contractor = as("seed", "ADMIN", null, () -> {
            Organization owner = org("OWN", "OWNER"); Organization provider = org("PRV", "SERVICE_PROVIDER");
            ServiceGrant g = new ServiceGrant();
            g.providerOrgId = provider.id; g.clientOrgId = owner.id; g.scope = "SELECTED_SITES"; g.siteIds = "A";
            g.validFrom = LocalDate.now().minusDays(1); g.validTo = LocalDate.now().plusDays(30);
            crud.persistNew(g);
            AppUser u = new AppUser();
            u.fullName = "Contractor"; u.email = "c-" + UUID.randomUUID() + "@test"; u.role = "TECHNICIAN"; u.organizationId = provider.id;
            return crud.persistNew(u);
        });
        var scope = scopes.resolve(contractor);
        assertThat(scope.sites()).containsExactly(siteA.id);
        CurrentUser.set(new Principal(contractor.id, tenant, contractor.email, contractor.fullName, "TECHNICIAN", null));
        CurrentUser.setScope(scope);
        try {
            assertThat((Long) crud.list("assets", Map.of()).get("total")).isEqualTo(1);
            assertThatThrownBy(() -> crud.get("assets", assetB.id)).satisfies(e -> assertThat(((ApiException) e).status()).isEqualTo(404));
            Map<String, Object> body = Map.of("title", "x", "description", "y", "priority", "LOW", "siteId", siteA.id.toString(), "assetId", assetB.id.toString());
            assertThatThrownBy(() -> crud.create("maintenance-requests", body, null)).satisfies(e -> assertThat(((ApiException) e).status()).isEqualTo(400));
        } finally {
            CurrentUser.clear();
        }
        as("seed", "ADMIN", null, () -> {
            for (Object o : crud.repo(ServiceGrant.class).findAll()) {
                ServiceGrant g = (ServiceGrant) o;
                if (tenant.equals(g.tenantId)) { g.validTo = LocalDate.now().minusDays(1); crud.saveDomain(g, "UPDATE", null, Map.of()); }
            }
            return null;
        });
        assertThat(scopes.resolve(contractor).sites()).isEmpty();
    }

    @Test
    void activeDelegationLetsPlannerApproveWork() {
        WorkOrder wo = as("seed", "ADMIN", null, () -> {
            WorkOrder w = new WorkOrder();
            w.title = "Delegated"; w.workType = "CORRECTIVE"; w.priority = "HIGH"; w.siteId = siteA.id; w.estimatedHours = BigDecimal.ONE;
            return crud.persistNew(w);
        });
        AppUser[] people = as("seed", "ADMIN", null, () -> {
            AppUser mgr = new AppUser(); mgr.fullName = "Mgr"; mgr.email = "m-" + UUID.randomUUID() + "@t"; mgr.role = "MANAGER";
            AppUser pl = new AppUser(); pl.fullName = "Planner"; pl.email = "p-" + UUID.randomUUID() + "@t"; pl.role = "PLANNER";
            return new AppUser[]{crud.persistNew(mgr), crud.persistNew(pl)};
        });
        asUser(people[1], () -> workOrders.transition(wo.id, "TRIAGED", null, ver(wo.id)));
        asUser(people[1], () -> {
            assertThatThrownBy(() -> workOrders.transition(wo.id, "APPROVED", null, ver(wo.id))).isInstanceOf(ApiException.class);
            return null;
        });
        as("seed", "ADMIN", null, () -> {
            Delegation d = new Delegation();
            d.delegatorId = people[0].id; d.delegateId = people[1].id; d.permission = "APPROVE_WORK_ORDERS"; d.reason = "Leave";
            d.validFrom = Instant.now().minus(Duration.ofHours(1)); d.validTo = Instant.now().plus(Duration.ofDays(1));
            return crud.persistNew(d);
        });
        assertThat(asUser(people[1], () -> workOrders.availableTransitions(wo.id))).contains("APPROVED");
        assertThat(asUser(people[1], () -> workOrders.transition(wo.id, "APPROVED", null, ver(wo.id))).status).isEqualTo("APPROVED");
    }

    @Test
    void webhooksCannotTargetInternalAddresses() {
        WebhookUrlPolicy policy = new WebhookUrlPolicy(false);
        for (String url : new String[]{"https://169.254.169.254/latest/meta-data", "https://127.0.0.1/x", "https://10.0.0.5/hook", "https://192.168.1.1/",
                "https://[::1]/x", "http://example.com/hook", "https://user:pw@example.com/"}) {
            assertThatThrownBy(() -> policy.check(url)).as(url).isInstanceOf(ApiException.class);
        }
    }

    // ------------------------------------------------------------------ helpers
    private Map<String, Object> ver(UUID id) {
        Map<String, Object> m = new HashMap<>();
        m.put("version", crud.repo(WorkOrder.class).findById(id).orElseThrow().version);
        return m;
    }

    private Site site(String code) {
        Site s = new Site(); s.code = code; s.name = code; s.timeZone = "UTC";
        return crud.persistNew(s);
    }

    private Asset asset(String tag, UUID site, UUID customer) {
        Asset a = new Asset(); a.tag = tag; a.name = tag; a.assetType = "OTHER"; a.criticality = "C_MEDIUM"; a.siteId = site; a.customerId = customer;
        return crud.persistNew(a);
    }

    private Customer customer(String code) {
        Customer c = new Customer(); c.code = code; c.name = code;
        return crud.persistNew(c);
    }

    private Organization org(String code, String kind) {
        Organization o = new Organization(); o.code = code; o.name = code; o.kind = kind;
        return crud.persistNew(o);
    }

    private <T> T as(String name, String role, UUID customer, Supplier<T> work) {
        CurrentUser.set(new Principal(UUID.randomUUID(), tenant, name + "@t", name, role, customer));
        try {
            return work.get();
        } finally {
            CurrentUser.clear();
        }
    }

    private <T> T asUser(AppUser u, Supplier<T> work) {
        CurrentUser.set(new Principal(u.id, tenant, u.email, u.fullName, u.role, null));
        try {
            return work.get();
        } finally {
            CurrentUser.clear();
        }
    }
}
