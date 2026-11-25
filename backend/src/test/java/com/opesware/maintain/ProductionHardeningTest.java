package com.opesware.maintain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.opesware.maintain.documents.application.MalwareScanner;
import com.opesware.maintain.documents.infrastructure.S3FileStore;
import com.opesware.maintain.platform.security.TokenService;
import com.opesware.maintain.platform.security.Totp;
import com.sun.net.httpserver.HttpServer;
import java.io.DataInputStream;
import java.io.ByteArrayOutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.junit.jupiter.api.Test;

class ProductionHardeningTest {

    @Test
    void totpMatchesRfc6238Vector() {
        // RFC 6238 Appendix B: SHA-1 secret "12345678901234567890", T=59s -> 94287082 (6-digit: 287082)
        String secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
        assertThat(Totp.code(secret, 59 / 30)).isEqualTo("287082");
        assertThat(Totp.verify(secret, "287082", Instant.ofEpochSecond(59))).isTrue();
        assertThat(Totp.verify(secret, "287083", Instant.ofEpochSecond(59))).isFalse();
        assertThat(Totp.code(secret, 1111111109L / 30)).isEqualTo("081804");
    }

    @Test
    void productionRefusesDevelopmentSecret() {
        assertThatThrownBy(() -> new TokenService(TokenService.DEV_SECRET, 3600, true)).isInstanceOf(IllegalStateException.class);
        assertThat(new TokenService(TokenService.DEV_SECRET, 3600, false)).isNotNull();
    }

    @Test
    void clamdInstreamProtocol() throws Exception {
        try (ServerSocket server = new ServerSocket(0)) {
            Thread t = new Thread(() -> {
                for (int i = 0; i < 2; i++) {
                    try (Socket s = server.accept()) {
                        DataInputStream in = new DataInputStream(s.getInputStream());
                        byte[] cmd = new byte[10];
                        in.readFully(cmd);
                        ByteArrayOutputStream body = new ByteArrayOutputStream();
                        for (int len = in.readInt(); len > 0; len = in.readInt()) {
                            byte[] chunk = new byte[len];
                            in.readFully(chunk);
                            body.write(chunk);
                        }
                        String reply = body.toString(StandardCharsets.ISO_8859_1).contains("Win.Test.Bad") ? "stream: Win.Test.Bad FOUND\0" : "stream: OK\0";
                        s.getOutputStream().write(reply.getBytes(StandardCharsets.US_ASCII));
                    } catch (Exception ignored) { }
                }
            });
            t.start();
            MalwareScanner scanner = new MalwareScanner("127.0.0.1", server.getLocalPort());
            assertThat(scanner.scan("hello world".getBytes(), "text/plain").result()).isEqualTo(MalwareScanner.Result.CLEAN);
            MalwareScanner.Verdict bad = scanner.scan("payload Win.Test.Bad".getBytes(), "text/plain");
            assertThat(bad.result()).isEqualTo(MalwareScanner.Result.INFECTED);
            assertThat(bad.reason()).contains("Win.Test.Bad");
            t.join(5000);
        }
        // scanner configured but unreachable -> held for re-scan, never accepted
        assertThat(new MalwareScanner("127.0.0.1", 1).scan("x".getBytes(), "text/plain").result()).isEqualTo(MalwareScanner.Result.UNAVAILABLE);
    }

    @Test
    void s3StoreRoundTripsThroughSignedRequests() throws Exception {
        Map<String, byte[]> objects = new ConcurrentHashMap<>();
        Map<String, String> auth = new ConcurrentHashMap<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", ex -> {
            auth.put(ex.getRequestMethod(), ex.getRequestHeaders().getFirst("Authorization"));
            String path = ex.getRequestURI().getRawPath();
            if ("PUT".equals(ex.getRequestMethod())) {
                objects.put(path, ex.getRequestBody().readAllBytes());
                ex.sendResponseHeaders(200, -1);
            } else {
                byte[] b = objects.get(path);
                if (b == null) { ex.sendResponseHeaders(404, -1); } else { ex.sendResponseHeaders(200, b.length); ex.getResponseBody().write(b); }
            }
            ex.close();
        });
        server.start();
        try {
            S3FileStore s3 = new S3FileStore("http://127.0.0.1:" + server.getAddress().getPort(), "evidence", "af-south-1", "AK", "SK", true);
            s3.put("tenant/abc def", "certificate".getBytes(), "application/pdf");
            assertThat(new String(s3.get("tenant/abc def"))).isEqualTo("certificate");
            assertThat(objects).containsKey("/evidence/tenant/abc%20def");
            assertThat(auth.get("PUT")).contains("Credential=AK/").contains("/af-south-1/s3/aws4_request")
                    .contains("SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date;x-amz-server-side-encryption");
        } finally {
            server.stop(0);
        }
    }
}
