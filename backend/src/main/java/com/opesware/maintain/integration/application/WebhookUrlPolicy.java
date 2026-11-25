package com.opesware.maintain.integration.application;

import com.opesware.maintain.platform.application.ApiException;
import java.net.InetAddress;
import java.net.URI;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * SSRF guard for outbound webhooks: https only, and the host must not resolve to loopback,
 * private, link-local (cloud metadata), multicast or unspecified addresses. Checked when a
 * subscription is saved and again before every delivery (DNS rebinding).
 */
@Component
public class WebhookUrlPolicy {
    private final boolean allowPrivate;

    public WebhookUrlPolicy(@Value("${opes.webhooks.allow-private:false}") boolean allowPrivate) {
        this.allowPrivate = allowPrivate;
    }

    /** Strict check used before every delivery: the host must resolve to public addresses only. */
    public void check(String url) {
        check(url, true);
    }

    /** At save time an unresolvable host is allowed (it is re-checked strictly before each delivery). */
    public void checkOnSave(String url) {
        check(url, false);
    }

    private void check(String url, boolean requireResolution) {
        URI u;
        try {
            u = URI.create(url);
        } catch (RuntimeException e) {
            throw ApiException.invalid("Webhook URL is not valid");
        }
        if (!allowPrivate && !"https".equalsIgnoreCase(u.getScheme())) throw ApiException.invalid("Webhook URLs must use https");
        if (u.getHost() == null || u.getUserInfo() != null) throw ApiException.invalid("Webhook URL must have a host and no credentials");
        if (allowPrivate) return;
        try {
            for (InetAddress a : InetAddress.getAllByName(u.getHost())) {
                if (a.isLoopbackAddress() || a.isSiteLocalAddress() || a.isLinkLocalAddress() || a.isAnyLocalAddress()
                        || a.isMulticastAddress() || isUniqueLocalV6(a) || isCgnat(a)) {
                    throw ApiException.invalid("Webhook URL resolves to a private or internal address");
                }
            }
        } catch (java.net.UnknownHostException e) {
            if (requireResolution) throw ApiException.invalid("Webhook host cannot be resolved");
        }
    }

    private static boolean isUniqueLocalV6(InetAddress a) {
        byte[] b = a.getAddress();
        return b.length == 16 && (b[0] & 0xfe) == 0xfc;
    }

    private static boolean isCgnat(InetAddress a) {
        byte[] b = a.getAddress();
        return b.length == 4 && (b[0] & 0xff) == 100 && (b[1] & 0xc0) == 64;
    }
}
