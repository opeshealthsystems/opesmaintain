package com.opesware.maintain.onboarding.api;

import com.opesware.maintain.onboarding.application.SignupService;
import com.opesware.maintain.onboarding.application.TenantProvisioningService;
import com.opesware.maintain.onboarding.domain.SignupRequest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.boot.actuate.endpoint.annotation.Endpoint;
import org.springframework.boot.actuate.endpoint.annotation.ReadOperation;
import org.springframework.boot.actuate.endpoint.annotation.WriteOperation;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Operator tool for sign-ups waiting for manual review (used while e-mail verification is unavailable).
 * Exposed only as an actuator endpoint, which in production lives on the management port bound to
 * 127.0.0.1 and is never routed by the reverse proxy. Enabled only with opes.signup.review-endpoint=true.
 */
@Component
@Endpoint(id = "signups")
@ConditionalOnProperty(name = "opes.signup.review-endpoint", havingValue = "true")
public class SignupReviewEndpoint {
    private final SignupService signup;

    public SignupReviewEndpoint(SignupService signup) {
        this.signup = signup;
    }

    @ReadOperation
    public List<Map<String, Object>> pending() {
        return signup.pendingReview().stream().map(SignupReviewEndpoint::view).toList();
    }

    /** Body: {"email": "...", "action": "approve" | "reject"}. */
    @WriteOperation
    public Map<String, Object> decide(String email, String action) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("email", email);
        if ("reject".equalsIgnoreCase(action)) {
            signup.reject(email);
            m.put("status", "REJECTED");
            return m;
        }
        TenantProvisioningService.Provisioned p = signup.approve(email);
        m.put("status", "APPROVED");
        m.put("tenantId", p.tenantId().toString());
        return m;
    }

    private static Map<String, Object> view(SignupRequest r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("email", r.email);
        m.put("fullName", r.fullName);
        m.put("company", r.companyName);
        m.put("country", r.country);
        m.put("phone", r.phone);
        m.put("industry", r.industry);
        m.put("plan", r.planInterest);
        m.put("createdAt", r.createdAt.toString());
        return m;
    }
}
