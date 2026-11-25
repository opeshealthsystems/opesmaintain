package com.opesware.maintain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.opesware.maintain.commercial.domain.Customer;
import com.opesware.maintain.commercial.domain.Quote;
import com.opesware.maintain.commercial.domain.ServiceContract;
import com.opesware.maintain.documents.api.DocumentCommandController;
import com.opesware.maintain.identity.api.AuthController;
import com.opesware.maintain.organization.domain.Site;
import com.opesware.maintain.procurement.domain.Vendor;
import com.opesware.maintain.platform.api.WorkspaceController;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.domain.Tenant;
import com.opesware.maintain.platform.infrastructure.TenantRepo;
import com.opesware.maintain.platform.security.CurrentUser;
import com.opesware.maintain.platform.security.Principal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/** Need-to-know reads (spec §11.1 "default is deny") without breaking commands that touch restricted records. */
@SpringBootTest
@ActiveProfiles("test")
class NeedToKnowAccessTest {
    @Autowired CrudService crud;
    @Autowired TenantRepo tenants;
    @Autowired AuthController auth;
    @Autowired WorkspaceController workspace;
    @Autowired DocumentCommandController documents;

    UUID tenant;
    UUID site;
    UUID contract;
    String quoteTitle;
    String vendorName;
    String quoteCurrency;

    @BeforeEach
    void seed() {
        Tenant t = new Tenant();
        t.id = UUID.randomUUID(); t.code = "ntk-" + t.id; t.legalName = "NTK"; t.status = "ACTIVE"; t.currency = "XAF";
        tenant = tenants.save(t).id;
        as("ADMIN");
        Site s = new Site(); s.code = "S1"; s.name = "Main"; s.timeZone = "UTC";
        site = crud.persistNew(s).id;
        Customer c = new Customer(); c.code = "C1"; c.name = "Clinique Bonamoussadi";
        UUID customer = crud.persistNew(c).id;
        ServiceContract sc = new ServiceContract(); sc.customerId = customer; sc.title = "Full service 2027"; sc.contractType = "FULL_SERVICE";
        sc.startDate = LocalDate.now().minusDays(1); sc.endDate = LocalDate.now().plusYears(1);
        contract = crud.persistNew(sc).id;
        quoteTitle = "Ventilator overhaul " + UUID.randomUUID();
        Quote q = new Quote(); q.customerId = customer; q.title = quoteTitle;
        quoteCurrency = crud.persistNew(q).currency;
        vendorName = "Biomedical Supplies " + UUID.randomUUID();
        Vendor v = new Vendor(); v.code = "V1"; v.name = vendorName;
        crud.persistNew(v);
    }

    @AfterEach
    void clear() {
        CurrentUser.clear();
    }

    private void as(String role) {
        CurrentUser.set(new Principal(UUID.randomUUID(), tenant, role.toLowerCase() + "@ntk.test", role, role, null));
    }

    private int status(String path) {
        try {
            crud.list(path, Map.of());
            return 200;
        } catch (ApiException e) {
            return e.status();
        }
    }

    @Test
    void commercialDocumentsDefaultToTheWorkspaceCurrency() {
        assertThat(quoteCurrency).isEqualTo("XAF");
    }

    @Test
    void eachRoleReadsOnlyWhatItsJobNeeds() {
        as("TECHNICIAN");
        assertThat(status("work-orders")).isEqualTo(200);
        assertThat(status("assets")).isEqualTo(200);
        assertThat(status("parts")).isEqualTo(200);
        assertThat(status("customers")).isEqualTo(200);
        assertThat(status("quotes")).isEqualTo(403);
        assertThat(status("billing-exports")).isEqualTo(403);
        assertThat(status("service-contracts")).isEqualTo(403);
        assertThat(status("vendors")).isEqualTo(403);
        assertThat(status("purchase-orders")).isEqualTo(403);
        assertThat(status("users")).isEqualTo(403);

        as("STOREKEEPER");
        assertThat(status("purchase-orders")).isEqualTo(200);
        assertThat(status("vendors")).isEqualTo(200);
        assertThat(status("quotes")).isEqualTo(403);

        as("COMMERCIAL");
        assertThat(status("quotes")).isEqualTo(200);
        assertThat(status("service-contracts")).isEqualTo(200);
        assertThat(status("purchase-orders")).isEqualTo(403);

        as("AUDITOR");
        for (String p : List.of("quotes", "purchase-orders", "users", "audit-events")) assertThat(status(p)).isEqualTo(200);
    }

    @Test
    void commandsStillWorkWhenTheyTouchRestrictedRecords() {
        // A technician raises a work order under a service contract; the SLA hook loads the contract internally.
        as("TECHNICIAN");
        Map<String, Object> body = new HashMap<>(Map.of("title", "Pump 3 leaking", "siteId", site.toString(), "contractId", contract.toString(), "priority", "HIGH"));
        Map<String, Object> wo = crud.create("work-orders", body, UUID.randomUUID().toString());
        assertThat(wo.get("id")).isNotNull();
        // ...but cannot open the contract itself.
        assertThatThrownBy(() -> crud.get("service-contracts", contract)).satisfies(e -> assertThat(((ApiException) e).status()).isEqualTo(403));
    }

    @Test
    void searchAndReportsFollowTheSameRules() {
        // Suppliers are searchable but restricted to purchasing roles.
        as("TECHNICIAN");
        List<Map<String, Object>> hits = workspace.search(vendorName.substring(0, 18));
        assertThat(hits).noneMatch(h -> "vendors".equals(h.get("resource")));
        assertThatThrownBy(() -> documents.report("INVENTORY_VALUATION", null, null)).satisfies(e -> assertThat(((ApiException) e).status()).isEqualTo(403));

        as("STOREKEEPER");
        assertThat(workspace.search(vendorName.substring(0, 18))).anyMatch(h -> "vendors".equals(h.get("resource")));

        as("COMMERCIAL");
        assertThat(documents.report("SLA_PERFORMANCE", null, null)).isNotNull();
    }

    @Test
    void permissionsTellTheMenuExactlyWhatToShow() {
        as("TECHNICIAN");
        Map<String, Object> perms = auth.permissions();
        @SuppressWarnings("unchecked") List<String> readable = (List<String>) perms.get("readable");
        @SuppressWarnings("unchecked") List<String> pages = (List<String>) perms.get("pages");
        assertThat(readable).contains("work-orders", "assets", "parts").doesNotContain("quotes", "vendors", "users");
        assertThat(pages).contains("/dashboard", "/technician", "/work-board").doesNotContain("/analytics", "/reports", "/stock", "/portal", "/onboarding");
        for (String path : readable) assertThat(status(path)).as(path).isEqualTo(200);

        as("CUSTOMER");
        CurrentUser.set(new Principal(UUID.randomUUID(), tenant, "c@ntk.test", "Customer", "CUSTOMER", UUID.randomUUID()));
        @SuppressWarnings("unchecked") List<String> cPages = (List<String>) auth.permissions().get("pages");
        assertThat(cPages).containsExactly("/portal");
    }
}
