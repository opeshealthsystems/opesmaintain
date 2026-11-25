package com.opesware.maintain.platform.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Short-lived signed session tokens (HMAC-SHA256). In production deployments the
 * platform is fronted by a Keycloak-compatible OIDC provider; this local issuer
 * serves single-tenant on-prem and demo installations.
 */
@Component
public class TokenService {
    private final byte[] secret;
    private final long ttlSeconds;

    public static final String DEV_SECRET = "dev-only-secret-change-me-0123456789abcdef";

    public TokenService(@Value("${opes.security.token-secret}") String secret,
                        @Value("${opes.security.token-ttl-seconds:28800}") long ttlSeconds,
                        @Value("${opes.production:false}") boolean production) {
        if (secret == null || secret.length() < 32) throw new IllegalStateException("opes.security.token-secret must be >= 32 chars");
        if (production && DEV_SECRET.equals(secret)) {
            throw new IllegalStateException("Refusing to start in production with the development token secret; set OPES_TOKEN_SECRET");
        }
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
        this.ttlSeconds = ttlSeconds;
    }

    public record Verified(UUID userId, Instant issuedAt) {}

    public String issue(UUID userId) {
        return issue(userId, ttlSeconds);
    }

    /** Token with a custom lifetime (e.g. short support sessions). */
    public String issue(UUID userId, long lifetimeSeconds) {
        long now = Instant.now().getEpochSecond();
        long exp = now + Math.min(lifetimeSeconds, ttlSeconds);
        String payload = userId + "." + exp + "." + now;
        return b64(payload.getBytes(StandardCharsets.UTF_8)) + "." + b64(sign(payload));
    }

    /** Returns the user id when the token is authentic and unexpired, otherwise null. */
    public UUID verify(String token) {
        Verified v = verifyFull(token);
        return v == null ? null : v.userId();
    }

    public Verified verifyFull(String token) {
        try {
            String[] parts = token.split("\\.");
            if (parts.length != 2) return null;
            String payload = new String(Base64.getUrlDecoder().decode(parts[0]), StandardCharsets.UTF_8);
            if (!MessageDigest.isEqual(sign(payload), Base64.getUrlDecoder().decode(parts[1]))) return null;
            String[] p = payload.split("\\.");
            if (p.length < 3 || Long.parseLong(p[1]) < Instant.now().getEpochSecond()) return null;
            return new Verified(UUID.fromString(p[0]), Instant.ofEpochSecond(Long.parseLong(p[2])));
        } catch (RuntimeException e) {
            return null;
        }
    }

    public long ttlSeconds() { return ttlSeconds; }

    private byte[] sign(String payload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static String b64(byte[] b) { return Base64.getUrlEncoder().withoutPadding().encodeToString(b); }
}
