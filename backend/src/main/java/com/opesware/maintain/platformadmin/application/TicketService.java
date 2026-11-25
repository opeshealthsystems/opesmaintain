package com.opesware.maintain.platformadmin.application;

import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platformadmin.domain.SupportTicket;
import com.opesware.maintain.platformadmin.domain.SupportTicketNote;
import com.opesware.maintain.platformadmin.infrastructure.SupportTicketNoteRepository;
import com.opesware.maintain.platformadmin.infrastructure.SupportTicketRepository;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Support desk storage. Website messages become tickets automatically; operators work them in the console. */
@Service
public class TicketService {
    public static final Set<String> STATUSES = Set.of("OPEN", "PENDING", "RESOLVED", "CLOSED");
    public static final Set<String> PRIORITIES = Set.of("LOW", "NORMAL", "HIGH", "URGENT");
    private final SupportTicketRepository tickets;
    private final SupportTicketNoteRepository notes;

    public TicketService(SupportTicketRepository tickets, SupportTicketNoteRepository notes) {
        this.tickets = tickets;
        this.notes = notes;
    }

    /** Called when someone writes through the website contact form. */
    @Transactional
    public SupportTicket openFromWebsite(String name, String email, String phone, String company, String topic, String message) {
        String subject = (company == null || company.isBlank() ? name : company) + " — " + humanTopic(topic);
        SupportTicket t = open(null, subject, name, email, phone, "WEBSITE", topic, "DEMO".equals(topic) || "PERPETUAL".equals(topic) || "SOURCE".equals(topic) ? "HIGH" : "NORMAL");
        note(t.id, name + " <" + email + ">", message, false);
        return t;
    }

    @Transactional
    public SupportTicket open(UUID tenantId, String subject, String name, String email, String phone, String source, String topic, String priority) {
        if (subject == null || subject.isBlank()) throw ApiException.invalid("A subject is required");
        Instant now = Instant.now();
        SupportTicket t = new SupportTicket();
        t.id = UUID.randomUUID();
        t.number = "TCK-" + Long.toString(now.toEpochMilli() % 100_000_000L, 36).toUpperCase() + Integer.toString((int) (Math.random() * 36 * 36), 36).toUpperCase();
        t.tenantId = tenantId;
        t.subject = subject.length() > 200 ? subject.substring(0, 200) : subject;
        t.requesterName = name;
        t.requesterEmail = email;
        t.requesterPhone = phone;
        t.source = source;
        t.topic = topic;
        t.status = "OPEN";
        t.priority = PRIORITIES.contains(priority) ? priority : "NORMAL";
        t.createdAt = now;
        t.updatedAt = now;
        return tickets.save(t);
    }

    @Transactional
    public SupportTicketNote note(UUID ticketId, String author, String body, boolean internal) {
        if (body == null || body.isBlank()) throw ApiException.invalid("Write a message");
        SupportTicket t = tickets.findById(ticketId).orElseThrow(() -> ApiException.notFound("Ticket"));
        SupportTicketNote n = new SupportTicketNote();
        n.id = UUID.randomUUID();
        n.ticketId = ticketId;
        n.author = author;
        n.body = body.length() > 8000 ? body.substring(0, 8000) : body;
        n.internal = internal;
        n.createdAt = Instant.now();
        t.updatedAt = n.createdAt;
        tickets.save(t);
        return notes.save(n);
    }

    private static String humanTopic(String topic) {
        return switch (topic == null ? "" : topic) {
            case "DEMO" -> "demo request";
            case "SAAS" -> "cloud subscription";
            case "PERPETUAL" -> "perpetual license";
            case "SOURCE" -> "source code license";
            case "SUPPORT" -> "support";
            default -> "enquiry";
        };
    }
}
