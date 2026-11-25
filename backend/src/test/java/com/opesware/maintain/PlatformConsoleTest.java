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
import com.opesware.maintain.platformadmin.application.PlatformService;
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
}
