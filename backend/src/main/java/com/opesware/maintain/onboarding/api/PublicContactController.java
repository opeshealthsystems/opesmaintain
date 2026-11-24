package com.opesware.maintain.onboarding.api;

import com.opesware.maintain.onboarding.application.ContactService;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Website contact form (public, rate-limited, honeypot-protected). */
@RestController
@RequestMapping("/api/v1/public")
public class PublicContactController {
    private final ContactService contact;

    public PublicContactController(ContactService contact) {
        this.contact = contact;
    }

    @PostMapping("/contact")
    public Map<String, Object> send(@RequestBody Map<String, String> body) {
        if (body.getOrDefault("website", "").isBlank()) contact.submit(body);
        return Map.of("ok", true);
    }
}
