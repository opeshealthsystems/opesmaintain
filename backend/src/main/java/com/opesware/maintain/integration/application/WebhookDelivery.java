package com.opesware.maintain.integration.application;

import com.opesware.maintain.integration.domain.WebhookSubscription;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Signed outbound webhook delivery. Each subscription has a secret derived from the platform
 * secret (never stored); receivers verify {@code X-Opes-Signature: sha256=HMAC(secret, timestamp + "." + body)}.
 */
@Component
public class WebhookDelivery {
    private final byte[] master;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();

    public WebhookDelivery(@Value("${opes.security.token-secret}") String master) {
        this.master = master.getBytes(StandardCharsets.UTF_8);
    }

    public String secretFor(WebhookSubscription w) {
        return "whsec_" + HexFormat.of().formatHex(hmac(master, "webhook:" + w.id)).substring(0, 40);
    }

    /** Returns true on a 2xx response. */
    public boolean send(WebhookSubscription w, String eventType, String body) {
        String ts = String.valueOf(Instant.now().getEpochSecond());
        String sig = HexFormat.of().formatHex(hmac(secretFor(w).getBytes(StandardCharsets.UTF_8), ts + "." + body));
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(w.url)).timeout(Duration.ofSeconds(10))
                    .header("Content-Type", "application/json").header("User-Agent", "OPES-Maintain-Webhook/1.0")
                    .header("X-Opes-Event", eventType).header("X-Opes-Timestamp", ts).header("X-Opes-Signature", "sha256=" + sig)
                    .POST(HttpRequest.BodyPublishers.ofString(body)).build();
            int code = http.send(req, HttpResponse.BodyHandlers.discarding()).statusCode();
            return code >= 200 && code < 300;
        } catch (Exception e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            return false;
        }
    }

    static byte[] hmac(byte[] key, String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
