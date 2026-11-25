package com.opesware.maintain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.opesware.maintain.identity.api.AuthController;
import com.opesware.maintain.identity.domain.AppUser;
import com.opesware.maintain.identity.infrastructure.AppUserRepository;
import com.opesware.maintain.onboarding.application.SignupService;
import com.opesware.maintain.onboarding.application.TenantProvisioningService;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.domain.Tenant;
import com.opesware.maintain.platform.infrastructure.TenantRepo;
import com.opesware.maintain.platform.security.CurrentUser;
import com.opesware.maintain.platform.security.Principal;
import com.opesware.maintain.platform.security.TokenService;
import com.opesware.maintain.platformadmin.application.OperatorProvisioning;
import com.opesware.maintain.platformadmin.application.ConsoleService;
import com.opesware.maintain.platformadmin.application.PlatformService;
import com.opesware.maintain.onboarding.api.PublicContactController;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
class PlatformConsoleTest {
    @Autowired PlatformService platform;
    @Autowired OperatorProvisioning operators;
    @Autowired SignupService signup;
    @Autowired AuthController auth;
    @Autowired AppUserRepository users;
    @Autowired TenantRepo tenants;
    @Autowired TokenService tokens;
    @Autowired CrudService crud;
    @Autowired ConsoleService console;
    @Autowired PublicContactController contact;

    @AfterEach
    void clear() {
        CurrentUser.clear();
    }

    private record Company(UUID tenantId, UUID adminId, String email) {}

    private Company company() {
        String email = "owner-" + UUID.randomUUID() + "@example.com";
        Map<String, String> f = new HashMap<>(Map.of("email", email, "fullName", "Owner", "companyName", "Garage Akwa",
                "country", "CM", "industry", "FLEET_LOGISTICS", "password", "Platform2026x"));
        TenantProvisioningService.Provisioned p = signup.verify(email, signup.start(f).devCode());
        return new Company(p.tenantId(), p.userId(), email);
    }

    private void asOperator() {
        String email = "op-" + UUID.randomUUID() + "@opesware.com";
        operators.addOperator(email, "Operator");
        AppUser op = users.findFirstByEmailIgnoreCase(email).orElseThrow();
        CurrentUser.set(new Principal(op.id, op.tenantId, op.email, op.fullName, "ADMIN", null));
    }

    @Test
    void onlyPlatformOperatorsCanUseTheConsole() {
        Company c = company();
        CurrentUser.set(new Principal(c.adminId(), c.tenantId(), c.email(), "Owner", "ADMIN", null));
        assertThatThrownBy(() -> platform.overview()).satisfies(e -> assertThat(((ApiException) e).status()).isEqualTo(404));
        assertThatThrownBy(() -> platform.companies(null, null)).isInstanceOf(ApiException.class);
        assertThat(auth.me().get("platformOperator")).isEqualTo(false);

        asOperator();
        assertThat(auth.me().get("platformOperator")).isEqualTo(true);
        assertThat(platform.overview().get("companies")).isNotNull();
        List<Map<String, Object>> list = platform.companies(null, null);
        assertThat(list).anyMatch(m -> c.tenantId().toString().equals(m.get("id")));
        assertThat(list).noneMatch(m -> "opes-platform".equals(m.get("code")));
    }

    @Test
    void suspensionBlocksSignInAndReactivationRestoresIt() {
        Company c = company();
        asOperator();
        assertThatThrownBy(() -> platform.suspend(c.tenantId(), " ")).isInstanceOf(ApiException.class);
        platform.suspend(c.tenantId(), "Unpaid invoice");
        CurrentUser.clear();
        assertThatThrownBy(() -> auth.login(Map.of("email", c.email(), "password", "Platform2026x")))
                .satisfies(e -> assertThat(((ApiException) e).code()).isEqualTo("TENANT_SUSPENDED"));
        asOperator();
        platform.reactivate(c.tenantId());
        CurrentUser.clear();
        assertThat(auth.login(Map.of("email", c.email(), "password", "Platform2026x")).get("token")).isNotNull();
    }

    @Test
    void trialAndPlanChangesAreRecorded() {
        Company c = company();
        asOperator();
        Instant before = tenants.findById(c.tenantId()).orElseThrow().trialEndsAt;
        platform.extendTrial(c.tenantId(), 14);
        assertThat(tenants.findById(c.tenantId()).orElseThrow().trialEndsAt).isAfter(before.plusSeconds(13L * 24 * 3600));
        platform.setPlan(c.tenantId(), Map.of("plan", "PROFESSIONAL", "maxUsers", 40, "maxAssets", 3000));
        Tenant t = tenants.findById(c.tenantId()).orElseThrow();
        assertThat(t.plan).isEqualTo("PROFESSIONAL");
        assertThat(t.maxUsers).isEqualTo(40);
        assertThat(t.trialEndsAt).isNull();
        assertThatThrownBy(() -> platform.setPlan(c.tenantId(), Map.of("plan", "FREE_FOREVER"))).isInstanceOf(ApiException.class);
    }

    @Test
    void supportSessionsAreReadOnlyShortLivedAndAudited() {
        Company c = company();
        asOperator();
        assertThatThrownBy(() -> platform.supportSession(c.tenantId(), "", 30)).isInstanceOf(ApiException.class);
        Map<String, Object> s = platform.supportSession(c.tenantId(), "Customer asked for help importing assets", 500);
        assertThat(Instant.parse((String) s.get("expiresAt"))).isBefore(Instant.now().plusSeconds(121 * 60));
        UUID supportId = tokens.verify((String) s.get("token"));
        AppUser support = users.findById(supportId).orElseThrow();
        assertThat(support.tenantId).isEqualTo(c.tenantId());
        assertThat(support.role).isEqualTo("AUDITOR");
        assertThat(support.fullName).contains("OPES Support");

        // The support account can look but not change anything.
        CurrentUser.set(new Principal(support.id, c.tenantId(), support.email, support.fullName, "AUDITOR", null));
        assertThat(crud.list("assets", Map.of())).isNotNull();
        assertThatThrownBy(() -> crud.create("assets", Map.of("tag", "X", "name", "X"), UUID.randomUUID().toString()))
                .satisfies(e -> assertThat(((ApiException) e).status()).isEqualTo(403));
        assertThat(auth.me().get("supportSession")).isEqualTo(true);

        // The company sees who looked and why.
        CurrentUser.set(new Principal(c.adminId(), c.tenantId(), c.email(), "Owner", "ADMIN", null));
        List<?> events = (List<?>) crud.list("audit-events", Map.of("size", "200")).get("items");
        assertThat(events.toString()).contains("SUPPORT_SESSION_OPENED").contains("importing assets");
    }

    @Test
    void websiteMessagesBecomeTicketsThatOperatorsWork() {
        String email = "lead-" + UUID.randomUUID() + "@example.com";
        contact.send(new HashMap<>(Map.of("name", "Paul Ndi", "email", email, "topic", "PERPETUAL", "company", "Clinique Ndi",
                "country", "CM", "message", "We want an on-premise license for 30 users.")));
        Company c = company();
        asOperator();
        Map<String, Object> t = console.tickets("ACTIVE", null).stream().filter(x -> email.equals(x.get("requesterEmail"))).findFirst().orElseThrow();
        assertThat(t.get("priority")).isEqualTo("HIGH");
        UUID id = UUID.fromString((String) t.get("id"));
        Map<String, Object> d = console.updateTicket(id, Map.of("status", "PENDING", "tenantId", c.tenantId().toString(), "reply", "Quote sent by e-mail"));
        assertThat(d.get("status")).isEqualTo("PENDING");
        assertThat(d.get("company")).isEqualTo("Garage Akwa");
        assertThat((List<?>) d.get("conversation")).hasSizeGreaterThanOrEqualTo(3);
        assertThat(console.updateTicket(id, Map.of("status", "RESOLVED")).get("resolvedAt")).isNotNull();
        assertThatThrownBy(() -> console.updateTicket(id, Map.of("status", "LOST"))).isInstanceOf(ApiException.class);
    }

    @Test
    void invoicesMoveFromDraftToPaidAndPaidIsFinal() {
        Company c = company();
        asOperator();
        Map<String, Object> i = console.createInvoice(Map.of("tenantId", c.tenantId().toString(), "description", "Subscription Jan 2027", "amount", "250000"));
        assertThat(i.get("currency")).isEqualTo("XAF");
        assertThat(i.get("status")).isEqualTo("DRAFT");
        UUID id = UUID.fromString((String) i.get("id"));
        assertThat(console.setInvoiceStatus(id, "SENT", null).get("issuedOn")).isNotNull();
        Map<String, Object> paid = console.setInvoiceStatus(id, "PAID", "MTN-MoMo-12345");
        assertThat(paid.get("paymentReference")).isEqualTo("MTN-MoMo-12345");
        assertThatThrownBy(() -> console.setInvoiceStatus(id, "VOID", null)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> console.createInvoice(Map.of("tenantId", c.tenantId().toString(), "description", "x", "amount", "-5"))).isInstanceOf(ApiException.class);
        assertThat(console.revenue()).containsKeys("mrrUsd", "outstanding", "overdue");
    }

    @Test
    void announcementsReachTheRightAudienceAndNotesStayPrivate() {
        Company c = company();
        asOperator();
        String title = "Maintenance " + UUID.randomUUID();
        console.createAnnouncement(Map.of("title", title, "body", "Saturday 22:00–23:00 UTC", "level", "MAINTENANCE", "audience", "TRIAL"));
        String paying = "Paying only " + UUID.randomUUID();
        console.createAnnouncement(Map.of("title", paying, "body", "x", "audience", "PAYING"));
        assertThat(console.activeFor(c.tenantId())).anyMatch(a -> title.equals(a.get("title"))).noneMatch(a -> paying.equals(a.get("title")));
        console.addNote(c.tenantId(), "Called the owner; wants training in January.");
        assertThat(console.notes(c.tenantId())).hasSize(1);
        assertThat(console.health()).containsKeys("uptime", "schemaVersion", "catalogVersion");
        assertThat(console.companyUsage(c.tenantId()).get("AppUser")).isEqualTo(1L);

        CurrentUser.set(new Principal(c.adminId(), c.tenantId(), c.email(), "Owner", "ADMIN", null));
        assertThatThrownBy(() -> console.notes(c.tenantId())).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> console.tickets(null, null)).isInstanceOf(ApiException.class);
    }

    @Test
    void operatorsCannotDisableThemselves() {
        asOperator();
        UUID me = CurrentUser.require().userId();
        assertThatThrownBy(() -> console.setOperatorStatus(me, false)).isInstanceOf(ApiException.class);
        String other = "op2-" + UUID.randomUUID() + "@opesware.com";
        List<Map<String, Object>> ops = console.addOperator(other, "Second Operator");
        UUID otherId = UUID.fromString((String) ops.stream().filter(o -> other.equals(o.get("email"))).findFirst().orElseThrow().get("id"));
        assertThat(console.setOperatorStatus(otherId, false)).anyMatch(o -> other.equals(o.get("email")) && "SUSPENDED".equals(o.get("status")));
        assertThat(console.operatorAudit()).isNotNull();
    }
}
