package com.opesware.maintain;

import static org.assertj.core.api.Assertions.assertThat;

import com.opesware.maintain.documents.application.MalwareScanner;
import com.opesware.maintain.integration.application.WebhookDelivery;
import com.opesware.maintain.integration.domain.WebhookSubscription;
import com.opesware.maintain.platform.application.BusinessCalendar;
import com.opesware.maintain.platform.security.OidcVerifier;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;

class PlatformComponentsTest {

    @Test
    void businessHoursSkipNightsAndWeekends() {
        ZoneId douala = ZoneId.of("Africa/Douala");
        BusinessCalendar cal = BusinessCalendar.parse("MON-FRI 08:00-17:00");
        // Friday 16:00 local + 4 working hours -> Monday 11:00 local
        Instant fri = java.time.ZonedDateTime.of(2026, 11, 6, 16, 0, 0, 0, douala).toInstant();
        assertThat(cal.addWorkingMinutes(fri, 240, douala)).isEqualTo(java.time.ZonedDateTime.of(2026, 11, 9, 11, 0, 0, 0, douala).toInstant());
        // Saturday 10:00 + 1h -> Monday 09:00
        Instant sat = java.time.ZonedDateTime.of(2026, 11, 7, 10, 0, 0, 0, douala).toInstant();
        assertThat(cal.addWorkingMinutes(sat, 60, douala)).isEqualTo(java.time.ZonedDateTime.of(2026, 11, 9, 9, 0, 0, 0, douala).toInstant());
    }

    @Test
    void scannerQuarantinesMaliciousOrMislabelledContent() {
        MalwareScanner s = new MalwareScanner();
        assertThat(s.scan("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*".getBytes(), "text/plain").clean()).isFalse();
        assertThat(s.scan(new byte[]{'M', 'Z', 0, 0}, "application/pdf").clean()).isFalse();
        assertThat(s.scan("hello".getBytes(), "application/pdf").clean()).isFalse();
        assertThat(s.scan("%PDF-1.7 ...".getBytes(), "application/pdf").clean()).isTrue();
    }

    @Test
    void webhooksAreSignedAndVerifiable() throws Exception {
        AtomicReference<String> sig = new AtomicReference<>();
        AtomicReference<String> ts = new AtomicReference<>();
        AtomicReference<String> body = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/hook", ex -> {
            sig.set(ex.getRequestHeaders().getFirst("X-Opes-Signature"));
            ts.set(ex.getRequestHeaders().getFirst("X-Opes-Timestamp"));
            body.set(new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            ex.sendResponseHeaders(204, -1);
            ex.close();
        });
        server.start();
        try {
            WebhookDelivery d = new WebhookDelivery("test-secret-0123456789abcdef0123456789", new com.opesware.maintain.integration.application.WebhookUrlPolicy(true));
            WebhookSubscription w = new WebhookSubscription();
            w.id = UUID.randomUUID();
            w.url = "http://127.0.0.1:" + server.getAddress().getPort() + "/hook";
            assertThat(d.send(w, "WorkOrderClosed.v1", "{\"a\":1}")).isTrue();
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(d.secretFor(w).getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            String expected = "sha256=" + HexFormat.of().formatHex(mac.doFinal((ts.get() + "." + body.get()).getBytes(StandardCharsets.UTF_8)));
            assertThat(sig.get()).isEqualTo(expected);
        } finally {
            server.stop(0);
        }
    }

    @Test
    void oidcTokensAreVerifiedAgainstJwks() throws Exception {
        KeyPairGenerator g = KeyPairGenerator.getInstance("RSA");
        g.initialize(2048);
        KeyPair kp = g.generateKeyPair();
        RSAPublicKey pub = (RSAPublicKey) kp.getPublic();
        Base64.Encoder b64 = Base64.getUrlEncoder().withoutPadding();
        String jwks = "{\"keys\":[{\"kty\":\"RSA\",\"kid\":\"k1\",\"n\":\"" + b64.encodeToString(unsigned(pub.getModulus().toByteArray()))
                + "\",\"e\":\"" + b64.encodeToString(unsigned(pub.getPublicExponent().toByteArray())) + "\"}]}";
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/jwks", ex -> {
            byte[] b = jwks.getBytes(StandardCharsets.UTF_8);
            ex.sendResponseHeaders(200, b.length);
            ex.getResponseBody().write(b);
            ex.close();
        });
        server.start();
        try {
            OidcVerifier v = new OidcVerifier("http://127.0.0.1:" + server.getAddress().getPort() + "/jwks", "https://sso.test/realms/opes", "");
            String good = jwt(kp, "{\"iss\":\"https://sso.test/realms/opes\",\"exp\":" + (Instant.now().getEpochSecond() + 300) + ",\"email\":\"Tech@Opes.Demo\"}");
            assertThat(v.verify(good)).isEqualTo("tech@opes.demo");
            String wrongIssuer = jwt(kp, "{\"iss\":\"https://evil\",\"exp\":" + (Instant.now().getEpochSecond() + 300) + ",\"email\":\"a@b\"}");
            assertThat(v.verify(wrongIssuer)).isNull();
            String expired = jwt(kp, "{\"iss\":\"https://sso.test/realms/opes\",\"exp\":1000,\"email\":\"a@b\"}");
            assertThat(v.verify(expired)).isNull();
            assertThat(v.verify(good.substring(0, good.length() - 4) + "AAAA")).isNull();
        } finally {
            server.stop(0);
        }
    }

    private static String jwt(KeyPair kp, String claims) throws Exception {
        Base64.Encoder b64 = Base64.getUrlEncoder().withoutPadding();
        String head = b64.encodeToString("{\"alg\":\"RS256\",\"kid\":\"k1\"}".getBytes(StandardCharsets.UTF_8)) + "." + b64.encodeToString(claims.getBytes(StandardCharsets.UTF_8));
        Signature s = Signature.getInstance("SHA256withRSA");
        s.initSign(kp.getPrivate());
        s.update(head.getBytes(StandardCharsets.US_ASCII));
        return head + "." + b64.encodeToString(s.sign());
    }

    private static byte[] unsigned(byte[] b) {
        return b.length > 1 && b[0] == 0 ? java.util.Arrays.copyOfRange(b, 1, b.length) : b;
    }
}
