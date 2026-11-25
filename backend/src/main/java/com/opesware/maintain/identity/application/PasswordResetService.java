package com.opesware.maintain.identity.application;

import com.opesware.maintain.identity.domain.AppUser;
import com.opesware.maintain.identity.infrastructure.AppUserRepository;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.AuditService;
import com.opesware.maintain.platform.security.CurrentUser;
import com.opesware.maintain.platform.security.PasswordHasher;
import com.opesware.maintain.platform.security.Principal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Self-service password reset by e-mail. The response never reveals whether an account exists.
 * Tokens are 256-bit random, stored only as a SHA-256 hash, valid for 30 minutes and single-use.
 * A successful reset clears lockout and signs the user out everywhere.
 */
@Service
public class PasswordResetService {
    private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);
    static final Duration TTL = Duration.ofMinutes(30);
    private static final SecureRandom RANDOM = new SecureRandom();
    private final AppUserRepository users;
    private final AuditService audit;
    private final ObjectProvider<JavaMailSender> mail;
    private final String from;
    private final String baseUrl;
    private final boolean production;

    public PasswordResetService(AppUserRepository users, AuditService audit, ObjectProvider<JavaMailSender> mail,
                                @Value("${opes.mail.from:no-reply@opes-maintain.local}") String from,
                                @Value("${opes.public-url:http://localhost:3000}") String baseUrl,
                                @Value("${opes.production:false}") boolean production) {
        this.users = users;
        this.audit = audit;
        this.mail = mail;
        this.from = from;
        this.baseUrl = baseUrl;
        this.production = production;
    }

    /** Issues a reset token and e-mails the link. Returns the raw token only for tests and non-production diagnostics. */
    @Transactional
    public String request(String email) {
        String e = email == null ? "" : email.trim().toLowerCase();
        AppUser u = users.findFirstByEmailIgnoreCase(e).orElse(null);
        if (u == null || !"ACTIVE".equals(u.status) || u.email.endsWith("@invalid")) return null;
        byte[] raw = new byte[32];
        RANDOM.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        u.resetTokenHash = hash(token);
        u.resetTokenExpires = Instant.now().plus(TTL);
        users.save(u);
        auditAs(u, "PASSWORD_RESET_REQUESTED", Map.of());
        String link = baseUrl + "/reset-password?token=" + token;
        JavaMailSender sender = mail.getIfAvailable();
        if (sender != null) {
            try {
                SimpleMailMessage m = new SimpleMailMessage();
                m.setFrom(from);
                m.setTo(u.email);
                m.setSubject("[OPES Maintain] Reset your password");
                m.setText("A password reset was requested for your OPES Maintain account.\n\nOpen this link within 30 minutes to choose a new password:\n"
                        + link + "\n\nIf you did not request this, ignore this e-mail; your password stays unchanged.");
                sender.send(m);
            } catch (RuntimeException ex) {
                log.warn("Password reset e-mail could not be sent: {}", ex.getMessage());
            }
        } else if (!production) {
            log.info("E-mail is not configured; development reset link for {}: {}", u.email, link);
        } else {
            log.warn("Password reset requested but e-mail is not configured");
        }
        return token;
    }

    @Transactional
    public void reset(String token, String password) {
        if (token == null || token.isBlank()) throw invalidToken();
        String h = hash(token);
        AppUser u = users.findAll().stream().filter(x -> h.equals(x.resetTokenHash)).findFirst().orElseThrow(PasswordResetService::invalidToken);
        if (u.resetTokenExpires == null || u.resetTokenExpires.isBefore(Instant.now()) || !"ACTIVE".equals(u.status)) {
            u.resetTokenHash = null;
            users.save(u);
            throw invalidToken();
        }
        if (password == null || password.length() < 10 || !password.matches(".*\\d.*") || !password.matches(".*[A-Za-z].*")) {
            throw ApiException.invalid("Password must be at least 10 characters with letters and digits");
        }
        u.passwordHash = PasswordHasher.hash(password);
        u.resetTokenHash = null;
        u.resetTokenExpires = null;
        u.failedLogins = 0;
        u.lockedUntil = null;
        u.tokensValidAfter = Instant.now();
        users.save(u);
        auditAs(u, "PASSWORD_RESET_COMPLETED", Map.of());
    }

    private static ApiException invalidToken() {
        return new ApiException(400, "RESET_TOKEN_INVALID", "This reset link is invalid or has expired. Request a new one.");
    }

    static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private void auditAs(AppUser u, String action, Map<String, ?> detail) {
        Principal prev = CurrentUser.get();
        CurrentUser.set(new Principal(u.id, u.tenantId, u.email, u.fullName, u.role, u.customerId));
        try {
            audit.record(action, "User", u.id, detail);
        } finally {
            if (prev == null) CurrentUser.clear(); else CurrentUser.set(prev);
        }
    }
}
