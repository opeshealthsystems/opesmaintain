package com.opesware.maintain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.opesware.maintain.asset.domain.Asset;
import com.opesware.maintain.identity.api.AuthController;
import com.opesware.maintain.identity.application.PasswordResetService;
import com.opesware.maintain.identity.domain.AppUser;
import com.opesware.maintain.identity.infrastructure.AppUserRepository;
import com.opesware.maintain.organization.domain.Site;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.domain.Tenant;
import com.opesware.maintain.platform.infrastructure.TenantRepo;
import com.opesware.maintain.platform.security.AccessScope;
import com.opesware.maintain.platform.security.CurrentUser;
import com.opesware.maintain.platform.security.PasswordHasher;
import com.opesware.maintain.platform.security.Principal;
import com.opesware.maintain.platform.security.ScopeResolver;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
class PasswordResetAndSiteScopeTest {
    @Autowired PasswordResetService reset;
    @Autowired AuthController auth;
    @Autowired AppUserRepository users;
    @Autowired TenantRepo tenants;
    @Autowired CrudService crud;
    @Autowired ScopeResolver scopes;

    UUID tenant;
    AppUser user;
    Site siteA;
    Site siteB;

    @BeforeEach
    void setUp() {
        Tenant t = new Tenant();
        t.id = UUID.randomUUID(); t.code = "pr-" + t.id; t.legalName = "PR"; t.status = "ACTIVE";
        tenant = tenants.save(t).id;
        CurrentUser.set(new Principal(null, tenant, "seed", "seed", "ADMIN", null));
        siteA = site("SA"); siteB = site("SB");
        asset("A-1", siteA.id); asset("B-1", siteB.id);
        AppUser u = new AppUser();
        u.fullName = "Tech"; u.email = "tech-" + UUID.randomUUID() + "@test"; u.role = "TECHNICIAN"; u.siteId = siteA.id;
        user = crud.persistNew(u);
        user.passwordHash = PasswordHasher.hash("OldPassword123");
        users.save(user);
        CurrentUser.clear();
    }

    @AfterEach
    void clear() {
        CurrentUser.clear();
    }

    @Test
    void resetTokenWorksOnceAndNeverRevealsAccounts() {
        assertThat(reset.request("nobody-" + UUID.randomUUID() + "@test")).isNull();
        assertThat(auth.forgotPassword(Map.of("email", "nobody@test")).get("ok")).isEqualTo(true);
        String token = reset.request(user.email.toUpperCase());
        assertThat(token).isNotNull();
        AppUser stored = users.findById(user.id).orElseThrow();
        assertThat(stored.resetTokenHash).isNotEqualTo(token).hasSize(64);
        assertThatThrownBy(() -> reset.reset(token, "short")).isInstanceOf(ApiException.class);
        reset.reset(token, "NewPassword456");
        assertThat(auth.login(Map.of("email", user.email, "password", "NewPassword456")).get("token")).isNotNull();
        assertThatThrownBy(() -> reset.reset(token, "AnotherPass789")).satisfies(e -> assertThat(((ApiException) e).code()).isEqualTo("RESET_TOKEN_INVALID"));
        AppUser after = users.findById(user.id).orElseThrow();
        assertThat(after.tokensValidAfter).isNotNull();
    }

    @Test
    void expiredTokenIsRejected() {
        String token = reset.request(user.email);
        AppUser u = users.findById(user.id).orElseThrow();
        u.resetTokenExpires = Instant.now().minusSeconds(1);
        users.save(u);
        assertThatThrownBy(() -> reset.reset(token, "NewPassword456")).satisfies(e -> assertThat(((ApiException) e).code()).isEqualTo("RESET_TOKEN_INVALID"));
    }

    @Test
    void techniciansSeeOnlyTheirHomeSite() {
        AccessScope scope = scopes.resolve(users.findById(user.id).orElseThrow());
        assertThat(scope).isNotNull();
        assertThat(scope.sites()).containsExactly(siteA.id);
        CurrentUser.set(new Principal(user.id, tenant, user.email, user.fullName, "TECHNICIAN", null));
        CurrentUser.setScope(scope);
        try {
            assertThat((Long) crud.list("assets", Map.of()).get("total")).isEqualTo(1);
        } finally {
            CurrentUser.clear();
        }
        AppUser manager = users.findById(user.id).orElseThrow();
        manager.role = "MANAGER";
        assertThat(scopes.resolve(manager)).isNull();
    }

    private Site site(String code) {
        Site s = new Site(); s.code = code; s.name = code; s.timeZone = "UTC";
        return crud.persistNew(s);
    }

    private void asset(String tag, UUID site) {
        Asset a = new Asset(); a.tag = tag; a.name = tag; a.assetType = "OTHER"; a.criticality = "C_MEDIUM"; a.siteId = site;
        crud.persistNew(a);
    }
}
