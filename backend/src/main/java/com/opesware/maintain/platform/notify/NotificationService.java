package com.opesware.maintain.platform.notify;

import com.opesware.maintain.identity.domain.AppUser;
import com.opesware.maintain.identity.infrastructure.AppUserRepository;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.domain.Notification;
import com.opesware.maintain.platform.infrastructure.NotificationRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * In-app and e-mail notifications (plan workstream B). A recipient is a user e-mail or
 * {@code role:ROLE}. E-mail is queued with the notification and sent by {@link #sendPending},
 * with up to 5 attempts before the row is marked FAILED for operator follow-up.
 */
@Service
public class NotificationService {
    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);
    public static final int MAX_EMAIL_ATTEMPTS = 5;
    private final CrudService crud;
    private final AppUserRepository users;
    private final NotificationRepository notifications;
    private final ObjectProvider<JavaMailSender> mail;
    private final String from;
    private final String baseUrl;

    public NotificationService(CrudService crud, AppUserRepository users, NotificationRepository notifications, ObjectProvider<JavaMailSender> mail,
                               @Value("${opes.mail.from:no-reply@opes-maintain.local}") String from,
                               @Value("${opes.public-url:http://localhost:3000}") String baseUrl) {
        this.crud = crud;
        this.users = users;
        this.notifications = notifications;
        this.mail = mail;
        this.from = from;
        this.baseUrl = baseUrl;
    }

    @Transactional
    public Notification notify(String recipient, String category, String subject, String body, String link) {
        Notification n = new Notification();
        n.recipient = recipient;
        n.category = category;
        n.channel = "IN_APP";
        n.subject = subject.length() > 250 ? subject.substring(0, 250) : subject;
        n.body = body;
        n.link = link;
        n.status = "UNREAD";
        n.createdOn = Instant.now();
        n.emailAttempts = 0;
        n.emailStatus = mail.getIfAvailable() != null && !emailTargets(n).isEmpty() ? "PENDING" : "NONE";
        return crud.persistNew(n);
    }

    /** Users who receive e-mail for a notification: the addressed user or every active member of the role. */
    public List<AppUser> emailTargets(Notification n) {
        UUID tenant = com.opesware.maintain.platform.security.CurrentUser.requireTenant();
        return users.findByTenantId(tenant).stream()
                .filter(u -> "ACTIVE".equals(u.status) && !Boolean.FALSE.equals(u.emailNotifications) && u.email != null)
                .filter(u -> n.recipient == null ? false : n.recipient.startsWith("role:") ? n.recipient.equals("role:" + u.role) : n.recipient.equalsIgnoreCase(u.email))
                .toList();
    }

    /** Sends queued e-mail for one tenant. Returns the number of notifications processed. */
    @Transactional
    public int sendPending(UUID tenant) {
        JavaMailSender sender = mail.getIfAvailable();
        if (sender == null) return 0;
        int n = 0;
        for (Notification x : notifications.findByTenantId(tenant)) {
            if (!"PENDING".equals(x.emailStatus)) continue;
            n++;
            try {
                for (AppUser u : emailTargets(x)) {
                    SimpleMailMessage m = new SimpleMailMessage();
                    m.setFrom(from);
                    m.setTo(u.email);
                    m.setSubject("[OPES Maintain] " + x.subject);
                    m.setText((x.body == null ? "" : x.body) + (x.link == null ? "" : "\n\nOpen: " + baseUrl + x.link)
                            + "\n\nYou receive this because of your notification settings in OPES Maintain.");
                    sender.send(m);
                }
                x.emailStatus = "SENT";
            } catch (RuntimeException e) {
                x.emailAttempts = (x.emailAttempts == null ? 0 : x.emailAttempts) + 1;
                x.emailStatus = x.emailAttempts >= MAX_EMAIL_ATTEMPTS ? "FAILED" : "PENDING";
                log.warn("E-mail for notification {} failed (attempt {}): {}", x.id, x.emailAttempts, e.getMessage());
            }
            notifications.save(x);
        }
        return n;
    }
}
