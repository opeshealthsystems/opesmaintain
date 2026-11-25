package com.opesware.maintain.platform.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Per-client-address limit on sign-in attempts (complements per-account lockout against password
 * spraying). Fixed one-minute windows; behind a trusted proxy set server.forward-headers-strategy so
 * the client address is the real one.
 */
@Component
@Order(-1)
public class LoginRateLimiter extends OncePerRequestFilter {
    private final int perMinute;
    private final Map<String, long[]> windows = new ConcurrentHashMap<>();

    public LoginRateLimiter(@Value("${opes.security.login-per-minute:20}") int perMinute) {
        this.perMinute = perMinute;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest req) {
        String uri = req.getRequestURI();
        return !("POST".equals(req.getMethod()) && (uri.startsWith("/api/v1/auth/") || uri.startsWith("/api/v1/public/signup") || uri.equals("/api/v1/public/contact")));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        long minute = System.currentTimeMillis() / 60000;
        long[] w = windows.compute(req.getRemoteAddr() + "|" + req.getRequestURI(), (k, v) -> v == null || v[0] != minute ? new long[]{minute, 1} : new long[]{minute, v[1] + 1});
        if (windows.size() > 50_000) windows.entrySet().removeIf(e -> e.getValue()[0] != minute);
        if (w[1] > perMinute) {
            res.setStatus(429);
            res.setHeader("Retry-After", "60");
            res.setContentType("application/problem+json");
            res.getWriter().write("{\"status\":429,\"code\":\"RATE_LIMITED\",\"title\":\"Too many attempts\",\"detail\":\"Wait a minute and try again.\"}");
            return;
        }
        chain.doFilter(req, res);
    }
}
