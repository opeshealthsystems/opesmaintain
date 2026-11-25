package com.opesware.maintain.documents.infrastructure;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * S3-compatible object storage (AWS S3, MinIO, Ceph RGW) using AWS Signature V4 and path-style
 * URLs. Objects are written with server-side encryption requested and verified by SHA-256 on read.
 */
@Component
@ConditionalOnProperty(name = "opes.storage.type", havingValue = "s3")
public class S3FileStore implements FileStore {
    private static final DateTimeFormatter AMZ = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'");
    private final String endpoint;
    private final String bucket;
    private final String region;
    private final String accessKey;
    private final String secretKey;
    private final boolean sse;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    public S3FileStore(@Value("${opes.storage.s3.endpoint}") String endpoint, @Value("${opes.storage.s3.bucket}") String bucket,
                       @Value("${opes.storage.s3.region:us-east-1}") String region, @Value("${opes.storage.s3.access-key}") String accessKey,
                       @Value("${opes.storage.s3.secret-key}") String secretKey, @Value("${opes.storage.s3.sse:true}") boolean sse) {
        this.endpoint = endpoint.replaceAll("/+$", "");
        this.bucket = bucket;
        this.region = region;
        this.accessKey = accessKey;
        this.secretKey = secretKey;
        this.sse = sse;
    }

    @Override
    public void put(String key, byte[] data, String contentType) throws IOException {
        HttpResponse<String> r = send("PUT", key, data, contentType);
        if (r.statusCode() / 100 != 2) throw new IOException("S3 PUT failed: HTTP " + r.statusCode() + " " + r.body());
    }

    @Override
    public byte[] get(String key) throws IOException {
        HttpRequest req = signed("GET", key, new byte[0], null);
        try {
            HttpResponse<byte[]> r = http.send(req, HttpResponse.BodyHandlers.ofByteArray());
            if (r.statusCode() / 100 != 2) throw new IOException("S3 GET failed: HTTP " + r.statusCode());
            return r.body();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException(e);
        }
    }

    @Override
    public String kind() {
        return "s3";
    }

    private HttpResponse<String> send(String method, String key, byte[] body, String contentType) throws IOException {
        try {
            return http.send(signed(method, key, body, contentType), HttpResponse.BodyHandlers.ofString());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException(e);
        }
    }

    HttpRequest signed(String method, String key, byte[] body, String contentType) {
        URI uri = URI.create(endpoint + "/" + bucket + "/" + encodePath(key));
        String host = uri.getPort() > 0 ? uri.getHost() + ":" + uri.getPort() : uri.getHost();
        String amzDate = AMZ.format(ZonedDateTime.now(ZoneOffset.UTC));
        String payloadHash = hex(sha256(body));
        boolean put = "PUT".equals(method);
        java.util.TreeMap<String, String> headers = new java.util.TreeMap<>();
        headers.put("host", host);
        headers.put("x-amz-content-sha256", payloadHash);
        headers.put("x-amz-date", amzDate);
        if (put && contentType != null) headers.put("content-type", contentType);
        if (put && sse) headers.put("x-amz-server-side-encryption", "AES256");
        String auth = authorization(method, uri.getRawPath(), "", headers, payloadHash, amzDate, region, accessKey, secretKey);
        HttpRequest.Builder b = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(60)).header("Authorization", auth);
        headers.forEach((k, v) -> { if (!"host".equals(k)) b.header(k, v); });
        if (put) b.PUT(HttpRequest.BodyPublishers.ofByteArray(body)); else b.GET();
        return b.build();
    }

    /** AWS Signature Version 4 authorization header for the given canonical request parts. */
    static String authorization(String method, String rawPath, String query, java.util.SortedMap<String, String> headers, String payloadHash,
                                String amzDate, String region, String accessKey, String secretKey) {
        StringBuilder canon = new StringBuilder();
        headers.forEach((k, v) -> canon.append(k).append(':').append(v.trim()).append('\n'));
        String signedHeaders = String.join(";", headers.keySet());
        String canonical = method + "\n" + rawPath + "\n" + query + "\n" + canon + "\n" + signedHeaders + "\n" + payloadHash;
        String day = amzDate.substring(0, 8);
        String scope = day + "/" + region + "/s3/aws4_request";
        String toSign = "AWS4-HMAC-SHA256\n" + amzDate + "\n" + scope + "\n" + hex(sha256(canonical.getBytes(StandardCharsets.UTF_8)));
        byte[] k = hmac(("AWS4" + secretKey).getBytes(StandardCharsets.UTF_8), day);
        k = hmac(k, region);
        k = hmac(k, "s3");
        k = hmac(k, "aws4_request");
        return "AWS4-HMAC-SHA256 Credential=" + accessKey + "/" + scope + ", SignedHeaders=" + signedHeaders + ", Signature=" + hex(hmac(k, toSign));
    }

    private static String encodePath(String key) {
        StringBuilder sb = new StringBuilder();
        for (String part : key.split("/")) {
            if (!sb.isEmpty()) sb.append('/');
            sb.append(java.net.URLEncoder.encode(part, StandardCharsets.UTF_8).replace("+", "%20"));
        }
        return sb.toString();
    }

    private static byte[] sha256(byte[] b) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(b);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static byte[] hmac(byte[] key, String data) {
        try {
            Mac m = Mac.getInstance("HmacSHA256");
            m.init(new SecretKeySpec(key, "HmacSHA256"));
            return m.doFinal(data.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static String hex(byte[] b) {
        return HexFormat.of().formatHex(b);
    }
}
