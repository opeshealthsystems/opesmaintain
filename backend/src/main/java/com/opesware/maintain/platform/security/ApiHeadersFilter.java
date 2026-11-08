package com.opesware.maintain.platform.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Arrays;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Correlation ids (spec §15.3), API security headers and an explicit CORS allow-list (spec §16.1).
 * Runs before authentication so even rejected requests are traceable.
 */
@Component
@Order(0)
public class ApiHeadersFilter extends OncePerRequestFilter {
    public static final String HEADER = "X-Correlation-Id";
    private final Set<String> origins;

    public ApiHeadersFilter(@Value("${opes.security.cors-origins:}") String origins) {
        this.origins = Arrays.stream(origins.split(",")).map(String::trim).filter(s -> !s.isEmpty()).collect(Collectors.toSet());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        String inbound = req.getHeader(HEADER);
        String id = inbound != null && inbound.matches("[A-Za-z0-9-]{8,64}") ? inbound : UUID.randomUUID().toString();
        MDC.put("correlationId", id);
        res.setHeader(HEADER, id);
        if (req.getRequestURI().startsWith("/api/")) {
            res.setHeader("X-Content-Type-Options", "nosniff");
            res.setHeader("Cache-Control", "no-store");
            res.setHeader("X-Frame-Options", "DENY");
            res.setHeader("Referrer-Policy", "no-referrer");
            String origin = req.getHeader("Origin");
            if (origin != null && origins.contains(origin)) {
                res.setHeader("Access-Control-Allow-Origin", origin);
                res.setHeader("Vary", "Origin");
                res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, If-Match, Idempotency-Key, X-Correlation-Id");
                res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
                res.setHeader("Access-Control-Expose-Headers", "ETag, X-Correlation-Id");
                res.setHeader("Access-Control-Max-Age", "600");
            }
            if ("OPTIONS".equals(req.getMethod())) {
                res.setStatus(origin != null && origins.contains(origin) ? 204 : 403);
                MDC.remove("correlationId");
                return;
            }
        }
        try {
            chain.doFilter(req, res);
        } finally {
            MDC.remove("correlationId");
        }
    }
}
