package com.opesware.maintain.onboarding.api;

import com.opesware.maintain.onboarding.application.ContactService;
import com.opesware.maintain.onboarding.domain.ContactMessage;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.boot.actuate.endpoint.annotation.Endpoint;
import org.springframework.boot.actuate.endpoint.annotation.ReadOperation;
import org.springframework.boot.actuate.endpoint.annotation.WriteOperation;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;

/** Operator inbox for website messages; management port only (same switch as the sign-up review endpoint). */
@Component
@Endpoint(id = "inbox")
@ConditionalOnProperty(name = "opes.signup.review-endpoint", havingValue = "true")
public class InboxEndpoint {
    private final ContactService contact;

    public InboxEndpoint(ContactService contact) {
        this.contact = contact;
    }

    @ReadOperation
    public List<Map<String, Object>> messages(@Nullable Boolean all) {
        return contact.recent(!Boolean.TRUE.equals(all)).stream().map(InboxEndpoint::view).toList();
    }

    @WriteOperation
    public Map<String, Object> markRead() {
        return Map.of("markedRead", contact.markAllRead());
    }

    private static Map<String, Object> view(ContactMessage m) {
        Map<String, Object> v = new LinkedHashMap<>();
        v.put("createdAt", m.createdAt.toString());
        v.put("status", m.status);
        v.put("topic", m.topic);
        v.put("name", m.name);
        v.put("email", m.email);
        v.put("phone", m.phone);
        v.put("company", m.company);
        v.put("country", m.country);
        v.put("language", m.language);
        v.put("message", m.message);
        return v;
    }
}
