package com.opesware.maintain.onboarding.api;

import com.opesware.maintain.onboarding.application.Plans;
import com.opesware.maintain.onboarding.application.SignupService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Unauthenticated endpoints used by the landing page and the sign-up form (/api/v1/public/** is public). */
@RestController
@RequestMapping("/api/v1/public")
public class PublicSignupController {
    private final SignupService signup;

    public PublicSignupController(SignupService signup) {
        this.signup = signup;
    }

    @GetMapping("/plans")
    public List<Plans.Plan> plans() {
        return Plans.ALL;
    }

    @PostMapping("/signup")
    public Map<String, Object> start(@RequestBody Map<String, String> body) {
        // Honeypot: real users never fill the hidden "website" field. Pretend success, store nothing.
        if (body.getOrDefault("website", "").isBlank()) {
            return started(signup.start(body));
        }
        return Map.of("ok", true, "email", body.getOrDefault("email", ""));
    }

    @PostMapping("/signup/resend")
    public Map<String, Object> resend(@RequestBody Map<String, String> body) {
        return started(signup.resend(body.get("email")));
    }

    @PostMapping("/signup/verify")
    public Map<String, Object> verify(@RequestBody Map<String, String> body) {
        signup.verify(body.get("email"), body.get("code"));
        return Map.of("ok", true);
    }

    private static Map<String, Object> started(SignupService.Started s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ok", true);
        m.put("email", s.email());
        if (s.expiresAt() != null) m.put("expiresAt", s.expiresAt().toString());
        if (s.devCode() != null) m.put("devCode", s.devCode());
        return m;
    }
}
