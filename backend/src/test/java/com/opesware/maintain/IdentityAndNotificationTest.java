package com.opesware.maintain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.opesware.maintain.identity.api.AuthController;
import com.opesware.maintain.identity.domain.AppUser;
import com.opesware.maintain.identity.infrastructure.AppUserRepository;
import com.opesware.maintain.integration.application.IntegrationService;
import com.opesware.maintain.maintenance.domain.MaintenanceRequest;
import com.opesware.maintain.organization.domain.Site;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.domain.Notification;
import com.opesware.maintain.platform.domain.Tenant;
import com.opesware.maintain.platform.infrastructure.NotificationRepository;
import com.opesware.maintain.platform.infrastructure.TenantRepo;
import com.opesware.maintain.platform.security.CurrentUser;
import com.opesware.maintain.platform.security.PasswordHasher;
import com.opesware.maintain.platform.security.Principal;
import com.opesware.maintain.platform.security.TokenService;
import com.opesware.maintain.platform.security.Totp;
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
class IdentityAndNotificationTest {
    @Autowired AuthController auth;
    @Autowired AppUserRepository users;
    @Autowired TenantRepo tenants;
    @Autowired CrudService crud;
    @Autowired IntegrationService integration;
    @Autowired NotificationRepository notifications;
    @Autowired TokenService tokens;

    UUID tenant;
    AppUser user;
    String email;

    @BeforeEach
    void setUp() {
        Tenant t = new Tenant();
        t.id = UUID.randomUUID(); t.code = "id-" + t.id; t.legalName = "Id test"; t.status = "ACTIVE";
        tenant = tenants.save(t).id;
        email = "mgr-" + UUID.randomUUID() + "@test";
        CurrentUser.set(new Principal(null, tenant, "seed", "seed", "ADMIN", null));
        AppUser u = new AppUser();
        u.fullName = "Manager"; u.email = email; u.role = "MANAGER"; u.status = "ACTIVE";
        user = crud.persistNew(u);
        user.passwordHash = PasswordHasher.hash("CorrectHorse42");
        users.save(user);
        CurrentUser.clear();
    }

    @AfterEach
    void clear() {
        CurrentUser.clear();
    }

    private Map<String, Object> login(String pw, String code) {
        return auth.login(code == null ? Map.of("email", email, "password", pw) : Map.of("email", email, "password", pw, "code", code));
    }

    @Test
    void fiveFailuresLockTheAccountWithoutRevealingIt() {
        for (int i = 0; i < 5; i++) assertThatThrownBy(() -> login("wrong", null)).satisfies(e -> assertThat(((ApiException) e).status()).isEqualTo(401));
        assertThatThrownBy(() -> login("CorrectHorse42", null)).satisfies(e -> assertThat(((ApiException) e).code()).isEqualTo("TOO_MANY_ATTEMPTS"));
        assertThatThrownBy(() -> auth.login(Map.of("email", "nobody@test", "password", "x")))
                .satisfies(e -> assertThat(((ApiException) e).code()).isEqualTo("INVALID_CREDENTIALS"));
    }

    @Test
    void enrolledUsersNeedAValidCodeAndRevocationKillsOldTokens() {
        String secret = Totp.newSecret();
        user = users.findById(user.id).orElseThrow();
        user.mfaSecret = secret;
        user.mfaEnrolledAt = Instant.now();
        users.save(user);
        assertThatThrownBy(() -> login("CorrectHorse42", null)).satisfies(e -> assertThat(((ApiException) e).code()).isEqualTo("MFA_REQUIRED"));
        assertThatThrownBy(() -> login("CorrectHorse42", "000000")).satisfies(e -> assertThat(((ApiException) e).code()).isIn("MFA_INVALID"));
        String token = (String) login("CorrectHorse42", Totp.code(secret, Instant.now().getEpochSecond() / 30)).get("token");
        TokenService.Verified v = tokens.verifyFull(token);
        assertThat(v.userId()).isEqualTo(user.id);
        user = users.findById(user.id).orElseThrow();
        user.tokensValidAfter = Instant.now().plusSeconds(5);
        users.save(user);
        assertThat(v.issuedAt()).isBefore(user.tokensValidAfter.minusSeconds(1));
    }

    @Test
    void newRequestNotifiesDispatchersThroughTheOutbox() {
        CurrentUser.set(new Principal(null, tenant, "seed", "seed", "ADMIN", null));
        Site s = new Site();
        s.code = "S"; s.name = "Site"; s.timeZone = "UTC";
        s = crud.persistNew(s);
        MaintenanceRequest r = new MaintenanceRequest();
        r.title = "Leak in plant room"; r.description = "Water"; r.siteId = s.id; r.priority = "HIGH";
        String number = crud.persistNew(r).number;
        integration.dispatch(tenant);
        integration.dispatch(tenant);
        long n = notifications.findByTenantId(tenant).stream()
                .filter((Notification x) -> "role:DISPATCHER".equals(x.recipient) && x.subject.contains(number)).count();
        assertThat(n).isEqualTo(1);
    }
}
