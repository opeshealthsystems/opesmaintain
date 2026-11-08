package com.opesware.maintain.platform.security;

import com.opesware.maintain.identity.domain.AppUser;
import com.opesware.maintain.identity.infrastructure.AppUserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Deny-by-default authentication for /api/** (spec §2.3 rule 4). */
@Component
@Order(1)
public class AuthFilter extends OncePerRequestFilter {
    private final TokenService tokens;
    private final AppUserRepository users;
    private final OidcVerifier oidc;
    private final MfaPolicy mfaPolicy;

    public AuthFilter(TokenService tokens, AppUserRepository users, OidcVerifier oidc, MfaPolicy mfaPolicy) {
        this.mfaPolicy = mfaPolicy;
        this.oidc = oidc;
        this.tokens = tokens;
        this.users = users;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        String path = req.getRequestURI();
        if (!path.startsWith("/api/") || isPublic(path) || "OPTIONS".equals(req.getMethod())) {
            chain.doFilter(req, res);
            return;
        }
        String header = req.getHeader("Authorization");
        TokenService.Verified v = header != null && header.startsWith("Bearer ") ? tokens.verifyFull(header.substring(7)) : null;
        AppUser user = v == null ? null : users.findById(v.userId()).orElse(null);
        if (user != null && user.tokensValidAfter != null && v.issuedAt().isBefore(user.tokensValidAfter.minusSeconds(1))) user = null;
        if (user == null && header != null && header.startsWith("Bearer ") && oidc.enabled()) {
            String email = oidc.verify(header.substring(7));
            if (email != null) user = users.findAll().stream().filter(u -> email.equalsIgnoreCase(u.email)).findFirst().orElse(null);
        }
        if (user == null || !"ACTIVE".equals(user.status)) {
            res.setStatus(401);
            res.setContentType("application/problem+json");
            res.getWriter().write("{\"status\":401,\"code\":\"UNAUTHENTICATED\",\"title\":\"Authentication required\"}");
            return;
        }
        if (mfaPolicy.enrollmentRequired(user) && !path.startsWith("/api/v1/me")) {
            res.setStatus(403);
            res.setContentType("application/problem+json");
            res.getWriter().write("{\"status\":403,\"code\":\"MFA_ENROLLMENT_REQUIRED\",\"title\":\"Set up two-step sign-in to continue\",\"detail\":\"Your role requires two-step sign-in. Enrol an authenticator app in Settings.\"}");
            return;
        }
        CurrentUser.set(new Principal(user.id, user.tenantId, user.email, user.fullName, user.role, user.customerId));
        try {
            chain.doFilter(req, res);
        } finally {
            CurrentUser.clear();
        }
    }

    private boolean isPublic(String path) {
        return path.equals("/api/v1/auth/login") || path.startsWith("/api/v1/public/");
    }
}
