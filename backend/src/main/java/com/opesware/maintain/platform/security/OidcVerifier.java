package com.opesware.maintain.platform.security;

import java.math.BigInteger;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.RSAPublicKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Verifies RS256 access tokens from a Keycloak-compatible OIDC provider (spec §2.2) when
 * {@code opes.security.oidc.jwks-uri} is configured. Checks signature (JWKS by kid), issuer,
 * audience (optional), expiry and not-before, then returns the e-mail claim used to resolve the
 * platform membership. Roles and tenant always come from OPES Maintain, never from the token.
 */
@Component
public class OidcVerifier {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final String jwksUri;
    private final String issuer;
    private final String audience;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private volatile Map<String, PublicKey> keys = Map.of();
    private volatile Instant fetchedAt = Instant.EPOCH;

    public OidcVerifier(@Value("${opes.security.oidc.jwks-uri:}") String jwksUri,
                        @Value("${opes.security.oidc.issuer:}") String issuer,
                        @Value("${opes.security.oidc.audience:}") String audience) {
        this.jwksUri = jwksUri;
        this.issuer = issuer;
        this.audience = audience;
    }

    public boolean enabled() {
        return jwksUri != null && !jwksUri.isBlank();
    }

    /** Returns the verified e-mail, or null when the token is not a valid OIDC token. */
    public String verify(String token) {
        if (!enabled()) return null;
        try {
            String[] parts = token.split("\\.");
            if (parts.length != 3) return null;
            JsonNode header = JSON.readTree(Base64.getUrlDecoder().decode(parts[0]));
            JsonNode claims = JSON.readTree(Base64.getUrlDecoder().decode(parts[1]));
            if (!"RS256".equals(header.path("alg").asString())) return null;
            PublicKey key = key(header.path("kid").asString());
            if (key == null) return null;
            Signature sig = Signature.getInstance("SHA256withRSA");
            sig.initVerify(key);
            sig.update((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII));
            if (!sig.verify(Base64.getUrlDecoder().decode(parts[2]))) return null;
            long now = Instant.now().getEpochSecond();
            if (claims.path("exp").asLong(0) < now - 30) return null;
            if (claims.has("nbf") && claims.path("nbf").asLong() > now + 30) return null;
            if (!issuer.isBlank() && !issuer.equals(claims.path("iss").asString())) return null;
            if (!audience.isBlank()) {
                JsonNode aud = claims.path("aud");
                boolean ok = aud.isArray() ? aud.valueStream().anyMatch(a -> audience.equals(a.asString())) : audience.equals(aud.asString());
                if (!ok) return null;
            }
            String email = claims.path("email").asString(null);
            return email == null ? null : email.toLowerCase();
        } catch (Exception e) {
            return null;
        }
    }

    private PublicKey key(String kid) throws Exception {
        PublicKey k = keys.get(kid);
        if (k == null && fetchedAt.isBefore(Instant.now().minusSeconds(60))) {
            refresh();
            k = keys.get(kid);
        }
        return k;
    }

    private synchronized void refresh() throws Exception {
        HttpResponse<String> r = http.send(HttpRequest.newBuilder(URI.create(jwksUri)).timeout(Duration.ofSeconds(10)).GET().build(), HttpResponse.BodyHandlers.ofString());
        Map<String, PublicKey> m = new HashMap<>();
        for (JsonNode jwk : JSON.readTree(r.body()).path("keys")) {
            if (!"RSA".equals(jwk.path("kty").asString())) continue;
            BigInteger n = new BigInteger(1, Base64.getUrlDecoder().decode(jwk.path("n").asString()));
            BigInteger e = new BigInteger(1, Base64.getUrlDecoder().decode(jwk.path("e").asString()));
            m.put(jwk.path("kid").asString(), KeyFactory.getInstance("RSA").generatePublic(new RSAPublicKeySpec(n, e)));
        }
        keys = m;
        fetchedAt = Instant.now();
    }
}
