package com.opesware.maintain.onboarding.application;

import com.opesware.maintain.onboarding.domain.ContactMessage;
import com.opesware.maintain.onboarding.infrastructure.ContactMessageRepository;
import com.opesware.maintain.platform.application.ApiException;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Stores website contact-form messages for the team to read on the server. */
@Service
public class ContactService {
    private static final Logger log = LoggerFactory.getLogger(ContactService.class);
    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]{1,64}@[^@\\s]+\\.[A-Za-z]{2,}$");
    private static final Set<String> TOPICS = Set.of("DEMO", "SAAS", "PERPETUAL", "SOURCE", "SUPPORT", "OTHER");
    private final ContactMessageRepository messages;
    private final org.springframework.beans.factory.ObjectProvider<com.opesware.maintain.platformadmin.application.TicketService> tickets;

    public ContactService(ContactMessageRepository messages,
                          org.springframework.beans.factory.ObjectProvider<com.opesware.maintain.platformadmin.application.TicketService> tickets) {
        this.messages = messages;
        this.tickets = tickets;
    }

    @Transactional
    public ContactMessage submit(Map<String, String> body) {
        String name = norm(body.get("name"));
        String email = norm(body.get("email")).toLowerCase(Locale.ROOT);
        String message = norm(body.get("message"));
        if (name.length() < 2 || name.length() > 120) throw ApiException.invalid("Enter your name");
        if (!EMAIL.matcher(email).matches() || email.length() > 200) throw ApiException.invalid("Enter a valid e-mail address");
        if (message.length() < 10 || message.length() > 5000) throw ApiException.invalid("Write a message of at least 10 characters");
        ContactMessage m = new ContactMessage();
        m.id = UUID.randomUUID();
        m.name = name;
        m.email = email;
        m.phone = cut(norm(body.get("phone")), 40);
        m.company = cut(norm(body.get("company")), 160);
        m.country = cut(norm(body.get("country")).toUpperCase(Locale.ROOT), 8);
        String topic = norm(body.get("topic")).toUpperCase(Locale.ROOT);
        m.topic = TOPICS.contains(topic) ? topic : "OTHER";
        m.language = "FR".equalsIgnoreCase(norm(body.get("language"))) ? "FR" : "EN";
        m.message = message;
        m.status = "NEW";
        m.createdAt = Instant.now();
        messages.save(m);
        // Every website message also opens a support ticket in the operator console.
        tickets.ifAvailable(t -> t.openFromWebsite(m.name, m.email, m.phone, m.company, m.topic, m.message));
        log.warn("New website message ({}) from {} <{}> — read with: opes-inbox", m.topic, m.name, m.email);
        return m;
    }

    @Transactional(readOnly = true)
    public List<ContactMessage> recent(boolean onlyNew) {
        return onlyNew ? messages.findByStatusOrderByCreatedAtAsc("NEW") : messages.findTop50ByOrderByCreatedAtDesc();
    }

    @Transactional
    public int markAllRead() {
        List<ContactMessage> unread = messages.findByStatusOrderByCreatedAtAsc("NEW");
        unread.forEach(m -> m.status = "READ");
        messages.saveAll(unread);
        return unread.size();
    }

    private static String norm(String s) {
        return s == null ? "" : s.trim();
    }

    private static String cut(String s, int max) {
        return s.isEmpty() ? null : s.length() > max ? s.substring(0, max) : s;
    }
}
