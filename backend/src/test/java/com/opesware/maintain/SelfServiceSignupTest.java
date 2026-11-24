package com.opesware.maintain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.opesware.maintain.asset.domain.Asset;
import com.opesware.maintain.identity.api.AuthController;
import com.opesware.maintain.identity.domain.AppUser;
import com.opesware.maintain.identity.infrastructure.AppUserRepository;
import com.opesware.maintain.onboarding.api.PublicSignupController;
import com.opesware.maintain.onboarding.application.SignupService;
import com.opesware.maintain.onboarding.application.TenantProvisioningService;
import com.opesware.maintain.onboarding.infrastructure.SignupRequestRepository;
import com.opesware.maintain.organization.domain.Organization;
import com.opesware.maintain.organization.domain.Site;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.domain.Tenant;
import com.opesware.maintain.platform.infrastructure.TenantRepo;
import com.opesware.maintain.platform.security.CurrentUser;
import com.opesware.maintain.platform.security.Principal;
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
class SelfServiceSignupTest {
    @Autowired SignupService signup;
    @Autowired PublicSignupController controller;
    @Autowired AuthController auth;
    @Autowired AppUserRepository users;
    @Autowired TenantRepo tenants;
    @Autowired SignupRequestRepository requests;
    @Autowired CrudService crud;

    @AfterEach
    void clear() {
        CurrentUser.clear();
    }

    private Map<String, String> form(String email) {
        Map<String, String> m = new HashMap<>();
        m.put("email", email);
        m.put("fullName", "Ngo Biyong Claire");
        m.put("companyName", "Hôpital Saint-Luc de Douala");
        m.put("country", "cm");
        m.put("phone", "+237 6 70 00 00 00");
        m.put("industry", "HEALTHCARE");
        m.put("plan", "PROFESSIONAL");
        m.put("password", "Maintenance2026");
        return m;
    }

    private static String email() {
        return "owner-" + UUID.randomUUID() + "@example.com";
    }

    @Test
    void signupVerifiedCreatesIsolatedTrialWorkspaceAndAdminCanSignIn() {
        String email = email();
        SignupService.Started s = signup.start(form(email.toUpperCase()));
        assertThat(s.email()).isEqualTo(email);
        assertThat(s.devCode()).matches("\\d{6}");
        assertThat(users.findFirstByEmailIgnoreCase(email)).isEmpty(); // nothing exists before verification
        assertThat(requests.findFirstByEmailOrderByCreatedAtDesc(email).orElseThrow().codeHash).isNotEqualTo(s.devCode()).hasSize(64);

        TenantProvisioningService.Provisioned p = signup.verify(email, s.devCode());

        Tenant t = tenants.findById(p.tenantId()).orElseThrow();
        assertThat(t.plan).isEqualTo("TRIAL");
        assertThat(t.source).isEqualTo("SELF_SIGNUP");
        assertThat(t.maxUsers).isEqualTo(10);
        assertThat(t.maxAssets).isEqualTo(500);
        assertThat(t.trialEndsAt).isAfter(Instant.now().plusSeconds(29L * 24 * 3600));
        assertThat(t.timeZone).isEqualTo("Africa/Douala");
        assertThat(t.currency).isEqualTo("XAF");
        assertThat(t.code).startsWith("hopital-saint-luc-de-douala-");
        assertThat(t.onboardingStep).isEqualTo("COMPANY");

        AppUser admin = users.findById(p.userId()).orElseThrow();
        assertThat(admin.tenantId).isEqualTo(t.id);
        assertThat(admin.role).isEqualTo("ADMIN");
        assertThat(admin.email).isEqualTo(email);
        Organization owner = crud.repo(Organization.class).findAll().stream()
                .filter(o -> t.id.equals(o.tenantId)).findFirst().orElseThrow();
        assertThat(owner.kind).isEqualTo("OWNER");
        assertThat(owner.name).isEqualTo("Hôpital Saint-Luc de Douala");
        assertThat(admin.organizationId).isEqualTo(owner.id);

        assertThat(auth.login(Map.of("email", email, "password", "Maintenance2026")).get("token")).isNotNull();

        // The code is single-use.
        assertThatThrownBy(() -> signup.verify(email, s.devCode()))
                .satisfies(e -> assertThat(((ApiException) e).code()).isEqualTo("SIGNUP_CODE_EXPIRED"));
    }

    @Test
    void newWorkspaceCannotSeeAnotherTenantsData() {
        Tenant other = new Tenant();
        other.id = UUID.randomUUID(); other.code = "other-" + other.id; other.legalName = "Other"; other.status = "ACTIVE";
        tenants.save(other);
        UUID foreignAsset = CurrentUser.runAsSystem(other.id, () -> {
            Site s = new Site();
            s.code = "OTH"; s.name = "Other site"; s.timeZone = "UTC";
            UUID siteId = crud.persistNew(s).id;
            Asset a = new Asset();
            a.tag = "OTH-1"; a.name = "Foreign chiller"; a.assetType = "HVAC"; a.criticality = "B_HIGH"; a.siteId = siteId;
            return crud.persistNew(a).id;
        });

        String email = email();
        TenantProvisioningService.Provisioned p = signup.verify(email, signup.start(form(email)).devCode());
        CurrentUser.set(new Principal(p.userId(), p.tenantId(), email, "Owner", "ADMIN", null));

        assertThatThrownBy(() -> crud.get("assets", foreignAsset))
                .satisfies(e -> assertThat(((ApiException) e).status()).isEqualTo(404));
        assertThat((List<?>) crud.list("assets", Map.of()).get("items")).isEmpty();
    }

    @Test
    void wrongCodesAreCountedAndLockTheRequest() {
        String email = email();
        String code = signup.start(form(email)).devCode();
        String wrong = code.equals("000000") ? "111111" : "000000";
        for (int i = 0; i < 5; i++) {
            assertThatThrownBy(() -> signup.verify(email, wrong))
                    .satisfies(e -> assertThat(((ApiException) e).code()).isEqualTo("SIGNUP_CODE_INVALID"));
        }
        assertThatThrownBy(() -> signup.verify(email, code))
                .satisfies(e -> assertThat(((ApiException) e).code()).isEqualTo("SIGNUP_TOO_MANY_ATTEMPTS"));
        // A resend issues a fresh code and resets the counter.
        String fresh = signup.resend(email).devCode();
        assertThat(signup.verify(email, fresh).tenantId()).isNotNull();
    }

    @Test
    void validationAndDuplicateEmailsAreRejected() {
        Map<String, String> weak = form(email());
        weak.put("password", "short");
        assertThatThrownBy(() -> signup.start(weak)).isInstanceOf(ApiException.class);
        Map<String, String> badEmail = form("not-an-email");
        assertThatThrownBy(() -> signup.start(badEmail)).isInstanceOf(ApiException.class);
        Map<String, String> badCountry = form(email());
        badCountry.put("country", "Cameroon");
        assertThatThrownBy(() -> signup.start(badCountry)).isInstanceOf(ApiException.class);

        String email = email();
        signup.verify(email, signup.start(form(email)).devCode());
        assertThatThrownBy(() -> signup.start(form(email)))
                .satisfies(e -> assertThat(((ApiException) e).code()).isEqualTo("EMAIL_IN_USE"));
    }

    @Test
    void honeypotSubmissionsStoreNothing() {
        String email = email();
        Map<String, String> bot = form(email);
        bot.put("website", "http://spam.example");
        assertThat(controller.start(bot).get("ok")).isEqualTo(true);
        assertThat(requests.findFirstByEmailOrderByCreatedAtDesc(email)).isEmpty();
        assertThat(controller.plans()).extracting("code").containsExactly("TRIAL", "STARTER", "PROFESSIONAL", "ENTERPRISE");
    }
}
