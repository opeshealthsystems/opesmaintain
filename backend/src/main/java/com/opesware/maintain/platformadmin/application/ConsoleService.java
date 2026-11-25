package com.opesware.maintain.platformadmin.application;

import com.opesware.maintain.identity.domain.AppUser;
import com.opesware.maintain.identity.infrastructure.AppUserRepository;
import com.opesware.maintain.onboarding.application.CatalogService;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.domain.AuditEvent;
import com.opesware.maintain.platform.domain.Tenant;
import com.opesware.maintain.platform.infrastructure.TenantRepo;
import com.opesware.maintain.platform.security.MfaPolicy;
import com.opesware.maintain.platform.security.Principal;
import com.opesware.maintain.platformadmin.domain.CompanyNote;
import com.opesware.maintain.platformadmin.domain.PlatformAnnouncement;
import com.opesware.maintain.platformadmin.domain.PlatformInvoice;
import com.opesware.maintain.platformadmin.domain.SupportTicket;
import com.opesware.maintain.platformadmin.domain.SupportTicketNote;
import com.opesware.maintain.platformadmin.infrastructure.CompanyNoteRepository;
import com.opesware.maintain.platformadmin.infrastructure.PlatformAnnouncementRepository;
import com.opesware.maintain.platformadmin.infrastructure.PlatformInvoiceRepository;
import com.opesware.maintain.platformadmin.infrastructure.SupportTicketNoteRepository;
import com.opesware.maintain.platformadmin.infrastructure.SupportTicketRepository;
import jakarta.persistence.EntityManager;
import java.lang.management.ManagementFactory;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Operator back office beyond the basics: support desk, notes, invoices, revenue, announcements, operators, audit, health. */
@Service
public class ConsoleService {
    /** Published seat prices (USD per user per month) used for the revenue estimate. */
    static final Map<String, Integer> SEAT_USD = Map.of("ADMIN", 65, "MANAGER", 65, "PLANNER", 65, "DISPATCHER", 65, "AUDITOR", 65,
            "TECHNICIAN", 45, "STOREKEEPER", 45, "SAFETY_OFFICER", 45, "CALIBRATION_OFFICER", 45, "COMMERCIAL", 65);
    private static final Set<String> INVOICE_STATUSES = Set.of("DRAFT", "SENT", "PAID", "VOID");
    private static final Set<String> LEVELS = Set.of("INFO", "WARNING", "MAINTENANCE");

    private final PlatformService platform;
    private final TicketService ticketService;
    private final SupportTicketRepository tickets;
    private final SupportTicketNoteRepository ticketNotes;
    private final CompanyNoteRepository companyNotes;
    private final PlatformInvoiceRepository invoices;
    private final PlatformAnnouncementRepository announcements;
    private final TenantRepo tenants;
    private final AppUserRepository users;
    private final OperatorProvisioning operators;
    private final CatalogService catalog;
    private final EntityManager em;
    private final String platformCode;

    public ConsoleService(PlatformService platform, TicketService ticketService, SupportTicketRepository tickets, SupportTicketNoteRepository ticketNotes,
                          CompanyNoteRepository companyNotes, PlatformInvoiceRepository invoices, PlatformAnnouncementRepository announcements,
                          TenantRepo tenants, AppUserRepository users, OperatorProvisioning operators, CatalogService catalog, EntityManager em,
                          @Value("${opes.platform.tenant-code:opes-platform}") String platformCode) {
        this.platform = platform;
        this.ticketService = ticketService;
        this.tickets = tickets;
        this.ticketNotes = ticketNotes;
        this.companyNotes = companyNotes;
        this.invoices = invoices;
        this.announcements = announcements;
        this.tenants = tenants;
        this.users = users;
        this.operators = operators;
        this.catalog = catalog;
        this.em = em;
        this.platformCode = platformCode;
    }

    private String me() {
        Principal p = platform.requireOperator();
        return p.name() + " <" + p.email() + ">";
    }

    // ------------------------------------------------------------------ sidebar counters & charts

    @Transactional(readOnly = true)
    public Map<String, Object> counters() {
        platform.requireOperator();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("openTickets", tickets.countByStatusIn(Set.of("OPEN", "PENDING")));
        m.put("overdueInvoices", invoices.findAll().stream().filter(this::overdue).count());
        m.put("pendingSignups", platform.overview().get("pendingSignups"));
        return m;
    }

    /** New companies per week and active users per week, last 12 weeks. */
    @Transactional(readOnly = true)
    public Map<String, Object> growth() {
        platform.requireOperator();
        UUID platformId = tenants.findByCode(platformCode).map(t -> t.id).orElse(null);
        LocalDate start = LocalDate.now(ZoneOffset.UTC).minusWeeks(11).with(java.time.DayOfWeek.MONDAY);
        List<Map<String, Object>> weeks = new ArrayList<>();
        for (int i = 0; i < 12; i++) {
            LocalDate from = start.plusWeeks(i), to = from.plusWeeks(1);
            Instant f = from.atStartOfDay().toInstant(ZoneOffset.UTC), t = to.atStartOfDay().toInstant(ZoneOffset.UTC);
            long signups = tenants.findAll().stream().filter(x -> !x.id.equals(platformId) && x.createdAt != null && !x.createdAt.isBefore(f) && x.createdAt.isBefore(t)).count();
            Map<String, Object> w = new LinkedHashMap<>();
            w.put("week", from.toString());
            w.put("newCompanies", signups);
            weeks.add(w);
        }
        long active30 = users.findAll().stream().filter(u -> !u.tenantId.equals(platformId) && u.lastLoginAt != null
                && u.lastLoginAt.isAfter(Instant.now().minus(Duration.ofDays(30)))).count();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("weeks", weeks);
        m.put("activeUsers30d", active30);
        m.put("mrrUsd", revenue().get("mrrUsd"));
        return m;
    }

    // ------------------------------------------------------------------ company detail

    @Transactional(readOnly = true)
    public List<Map<String, Object>> companyUsers(UUID tenantId) {
        platform.requireOperator();
        guardCustomer(tenantId);
        List<Map<String, Object>> out = new ArrayList<>();
        for (AppUser u : users.findByTenantId(tenantId)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("fullName", u.fullName); m.put("email", u.email); m.put("role", u.role); m.put("status", u.status);
            m.put("phone", u.phone); m.put("mfa", u.mfaEnrolledAt != null);
            m.put("support", u.email != null && u.email.endsWith(MfaPolicy.SUPPORT_EMAIL_DOMAIN));
            m.put("lastLoginAt", u.lastLoginAt == null ? null : u.lastLoginAt.toString());
            out.add(m);
        }
        out.sort((a, b) -> String.valueOf(b.get("lastLoginAt")).compareTo(String.valueOf(a.get("lastLoginAt"))));
        return out;
    }

    /** Record counts per module, for the usage tab. */
    @Transactional(readOnly = true)
    public Map<String, Object> companyUsage(UUID tenantId) {
        platform.requireOperator();
        guardCustomer(tenantId);
        Map<String, Object> m = new LinkedHashMap<>();
        for (String e : List.of("Site", "Asset", "WorkOrder", "MaintenanceRequest", "PmPlan", "Part", "WorkPermit", "InspectionResult", "CalibrationEvent", "Document", "AppUser")) {
            Long n = em.createQuery("select count(x) from " + e + " x where x.tenantId = :t", Long.class).setParameter("t", tenantId).getSingleResult();
            m.put(e, n);
        }
        Long done = em.createQuery("select count(w) from WorkOrder w where w.tenantId = :t and w.status = 'CLOSED'", Long.class).setParameter("t", tenantId).getSingleResult();
        m.put("closedWorkOrders", done);
        m.put("catalogClasses", em.createQuery("select count(c) from TenantCatalogClass c where c.tenantId = :t", Long.class).setParameter("t", tenantId).getSingleResult());
        return m;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> companyActivity(UUID tenantId) {
        platform.requireOperator();
        guardCustomer(tenantId);
        return em.createQuery("select a from AuditEvent a where a.tenantId = :t order by a.occurredAt desc", AuditEvent.class)
                .setParameter("t", tenantId).setMaxResults(60).getResultList().stream().map(ConsoleService::audit).toList();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> notes(UUID tenantId) {
        platform.requireOperator();
        guardCustomer(tenantId);
        return companyNotes.findByTenantIdOrderByCreatedAtDesc(tenantId).stream().map(n -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", n.id.toString()); m.put("author", n.author); m.put("body", n.body); m.put("createdAt", n.createdAt.toString());
            return m;
        }).toList();
    }

    @Transactional
    public List<Map<String, Object>> addNote(UUID tenantId, String body) {
        String author = me();
        guardCustomer(tenantId);
        if (body == null || body.isBlank()) throw ApiException.invalid("Write a note");
        CompanyNote n = new CompanyNote();
        n.id = UUID.randomUUID(); n.tenantId = tenantId; n.author = author;
        n.body = body.length() > 4000 ? body.substring(0, 4000) : body.trim();
        n.createdAt = Instant.now();
        companyNotes.save(n);
        return notes(tenantId);
    }

    // ------------------------------------------------------------------ support desk

    @Transactional(readOnly = true)
    public List<Map<String, Object>> tickets(String status, UUID tenantId) {
        platform.requireOperator();
        List<SupportTicket> list = tenantId != null ? tickets.findByTenantIdOrderByUpdatedAtDesc(tenantId) : tickets.findAllByOrderByUpdatedAtDesc();
        return list.stream().filter(t -> status == null || status.isBlank() || ("ACTIVE".equals(status) ? Set.of("OPEN", "PENDING").contains(t.status) : status.equals(t.status)))
                .map(this::ticket).toList();
    }

    @Transactional(readOnly = true)
    public Map<String, Object> ticketDetail(UUID id) {
        platform.requireOperator();
        SupportTicket t = tickets.findById(id).orElseThrow(() -> ApiException.notFound("Ticket"));
        Map<String, Object> m = ticket(t);
        List<Map<String, Object>> conv = new ArrayList<>();
        for (SupportTicketNote n : ticketNotes.findByTicketIdOrderByCreatedAtAsc(id)) {
            Map<String, Object> c = new LinkedHashMap<>();
            c.put("author", n.author); c.put("body", n.body); c.put("internal", n.internal); c.put("createdAt", n.createdAt.toString());
            conv.add(c);
        }
        m.put("conversation", conv);
        return m;
    }

    @Transactional
    public Map<String, Object> createTicket(Map<String, Object> body) {
        String author = me();
        UUID tenantId = body.get("tenantId") == null || String.valueOf(body.get("tenantId")).isBlank() ? null : UUID.fromString(String.valueOf(body.get("tenantId")));
        if (tenantId != null) guardCustomer(tenantId);
        SupportTicket t = ticketService.open(tenantId, str(body.get("subject")), str(body.get("requesterName")), str(body.get("requesterEmail")),
                str(body.get("requesterPhone")), "MANUAL", "SUPPORT", str(body.get("priority")));
        if (str(body.get("message")) != null) ticketService.note(t.id, author, str(body.get("message")), true);
        return ticketDetail(t.id);
    }

    @Transactional
    public Map<String, Object> updateTicket(UUID id, Map<String, Object> body) {
        String author = me();
        SupportTicket t = tickets.findById(id).orElseThrow(() -> ApiException.notFound("Ticket"));
        String status = str(body.get("status")), priority = str(body.get("priority")), assignee = str(body.get("assignee"));
        List<String> changes = new ArrayList<>();
        if (status != null && !status.equals(t.status)) {
            if (!TicketService.STATUSES.contains(status)) throw ApiException.invalid("Unknown status");
            changes.add("status " + t.status + " → " + status);
            t.status = status;
            t.resolvedAt = Set.of("RESOLVED", "CLOSED").contains(status) ? Instant.now() : null;
        }
        if (priority != null && !priority.equals(t.priority)) {
            if (!TicketService.PRIORITIES.contains(priority)) throw ApiException.invalid("Unknown priority");
            changes.add("priority " + t.priority + " → " + priority);
            t.priority = priority;
        }
        if (body.containsKey("assignee") && !String.valueOf(assignee).equals(String.valueOf(t.assignee))) {
            changes.add("assigned to " + (assignee == null ? "nobody" : assignee));
            t.assignee = assignee;
        }
        if (body.containsKey("tenantId")) {
            UUID tid = str(body.get("tenantId")) == null ? null : UUID.fromString(str(body.get("tenantId")));
            if (tid != null) guardCustomer(tid);
            t.tenantId = tid;
            changes.add("linked to " + (tid == null ? "no company" : tenants.findById(tid).map(x -> x.legalName).orElse("?")));
        }
        t.updatedAt = Instant.now();
        tickets.save(t);
        if (!changes.isEmpty()) ticketService.note(id, author, String.join("; ", changes), true);
        String reply = str(body.get("reply"));
        if (reply != null) ticketService.note(id, author, reply, Boolean.TRUE.equals(body.get("internal")));
        return ticketDetail(id);
    }

    private Map<String, Object> ticket(SupportTicket t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", t.id.toString()); m.put("number", t.number); m.put("subject", t.subject); m.put("status", t.status); m.put("priority", t.priority);
        m.put("source", t.source); m.put("topic", t.topic); m.put("assignee", t.assignee);
        m.put("requesterName", t.requesterName); m.put("requesterEmail", t.requesterEmail); m.put("requesterPhone", t.requesterPhone);
        m.put("tenantId", t.tenantId == null ? null : t.tenantId.toString());
        m.put("company", t.tenantId == null ? null : tenants.findById(t.tenantId).map(x -> x.legalName).orElse(null));
        m.put("createdAt", t.createdAt.toString()); m.put("updatedAt", t.updatedAt.toString());
        m.put("resolvedAt", t.resolvedAt == null ? null : t.resolvedAt.toString());
        return m;
    }

    // ------------------------------------------------------------------ billing

    @Transactional(readOnly = true)
    public List<Map<String, Object>> invoices(UUID tenantId) {
        platform.requireOperator();
        List<PlatformInvoice> list = tenantId != null ? invoices.findByTenantIdOrderByCreatedAtDesc(tenantId) : invoices.findAllByOrderByCreatedAtDesc();
        return list.stream().map(this::invoice).toList();
    }

    @Transactional
    public Map<String, Object> createInvoice(Map<String, Object> body) {
        String author = me();
        UUID tenantId = UUID.fromString(String.valueOf(body.get("tenantId")));
        Tenant t = guardCustomer(tenantId);
        BigDecimal amount;
        try { amount = new BigDecimal(String.valueOf(body.get("amount"))); } catch (RuntimeException e) { throw ApiException.invalid("Enter the amount"); }
        if (amount.signum() <= 0) throw ApiException.invalid("The amount must be positive");
        String desc = str(body.get("description"));
        if (desc == null) throw ApiException.invalid("Describe what is invoiced");
        PlatformInvoice i = new PlatformInvoice();
        i.id = UUID.randomUUID();
        i.number = "OPS-" + LocalDate.now().getYear() + "-" + String.format("%05d", invoices.count() + 1);
        i.tenantId = tenantId;
        i.description = desc.length() > 500 ? desc.substring(0, 500) : desc;
        i.periodStart = date(body.get("periodStart"));
        i.periodEnd = date(body.get("periodEnd"));
        i.amount = amount;
        i.currency = str(body.get("currency")) != null ? str(body.get("currency")).toUpperCase(Locale.ROOT) : (t.currency == null ? "XAF" : t.currency);
        i.status = "DRAFT";
        i.dueOn = date(body.get("dueOn")) != null ? date(body.get("dueOn")) : LocalDate.now().plusDays(30);
        i.createdBy = author;
        i.createdAt = Instant.now();
        invoices.save(i);
        return invoice(i);
    }

    @Transactional
    public Map<String, Object> setInvoiceStatus(UUID id, String status, String reference) {
        me();
        PlatformInvoice i = invoices.findById(id).orElseThrow(() -> ApiException.notFound("Invoice"));
        if (!INVOICE_STATUSES.contains(status)) throw ApiException.invalid("Unknown invoice status");
        if ("PAID".equals(i.status) && !"PAID".equals(status)) throw ApiException.guard("INVOICE_PAID", "A paid invoice cannot change status");
        i.status = status;
        if ("SENT".equals(status) && i.issuedOn == null) i.issuedOn = LocalDate.now();
        if ("PAID".equals(status)) { i.paidOn = LocalDate.now(); i.paymentReference = reference; }
        invoices.save(i);
        return invoice(i);
    }

    /** Monthly recurring revenue estimated from active users per role at published seat prices (USD). */
    @Transactional(readOnly = true)
    public Map<String, Object> revenue() {
        platform.requireOperator();
        UUID platformId = tenants.findByCode(platformCode).map(t -> t.id).orElse(null);
        Map<UUID, Tenant> byId = new LinkedHashMap<>();
        for (Tenant t : tenants.findAll()) if (!t.id.equals(platformId)) byId.put(t.id, t);
        Map<UUID, Long> mrr = new LinkedHashMap<>();
        for (AppUser u : users.findAll()) {
            Tenant t = byId.get(u.tenantId);
            if (t == null || "TRIAL".equals(t.plan) || "SUSPENDED".equals(t.status) || !"ACTIVE".equals(u.status)) continue;
            if (u.email != null && u.email.endsWith(MfaPolicy.SUPPORT_EMAIL_DOMAIN)) continue;
            mrr.merge(u.tenantId, (long) SEAT_USD.getOrDefault(u.role, 10), Long::sum);
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("mrrUsd", mrr.values().stream().mapToLong(Long::longValue).sum());
        m.put("payingCompanies", mrr.size());
        m.put("outstanding", invoices.findAll().stream().filter(i -> "SENT".equals(i.status)).map(i -> i.amount).reduce(BigDecimal.ZERO, BigDecimal::add));
        m.put("overdue", invoices.findAll().stream().filter(this::overdue).count());
        m.put("paidThisMonth", invoices.findAll().stream().filter(i -> i.paidOn != null && i.paidOn.withDayOfMonth(1).equals(LocalDate.now().withDayOfMonth(1)))
                .map(i -> i.amount).reduce(BigDecimal.ZERO, BigDecimal::add));
        m.put("note", "Estimate from active users × published seat prices; invoices are in each company's currency.");
        return m;
    }

    private boolean overdue(PlatformInvoice i) {
        return "SENT".equals(i.status) && i.dueOn != null && i.dueOn.isBefore(LocalDate.now());
    }

    private Map<String, Object> invoice(PlatformInvoice i) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", i.id.toString()); m.put("number", i.number); m.put("tenantId", i.tenantId.toString());
        m.put("company", tenants.findById(i.tenantId).map(t -> t.legalName).orElse("?"));
        m.put("description", i.description); m.put("amount", i.amount); m.put("currency", i.currency);
        m.put("status", overdue(i) ? "OVERDUE" : i.status);
        m.put("periodStart", s(i.periodStart)); m.put("periodEnd", s(i.periodEnd)); m.put("issuedOn", s(i.issuedOn));
        m.put("dueOn", s(i.dueOn)); m.put("paidOn", s(i.paidOn)); m.put("paymentReference", i.paymentReference);
        m.put("createdBy", i.createdBy); m.put("createdAt", i.createdAt.toString());
        return m;
    }

    // ------------------------------------------------------------------ announcements

    @Transactional(readOnly = true)
    public List<Map<String, Object>> announcements() {
        platform.requireOperator();
        return announcements.findAllByOrderByStartsAtDesc().stream().map(ConsoleService::announcement).toList();
    }

    @Transactional
    public Map<String, Object> createAnnouncement(Map<String, Object> body) {
        String author = me();
        String title = str(body.get("title")), text = str(body.get("body"));
        if (title == null || text == null) throw ApiException.invalid("Title and message are required");
        String level = str(body.get("level")) == null ? "INFO" : str(body.get("level"));
        if (!LEVELS.contains(level)) throw ApiException.invalid("Unknown level");
        String audience = str(body.get("audience")) == null ? "ALL" : str(body.get("audience"));
        if (!Set.of("ALL", "TRIAL", "PAYING").contains(audience)) throw ApiException.invalid("Unknown audience");
        PlatformAnnouncement a = new PlatformAnnouncement();
        a.id = UUID.randomUUID();
        a.title = title.length() > 160 ? title.substring(0, 160) : title;
        a.body = text.length() > 2000 ? text.substring(0, 2000) : text;
        a.level = level;
        a.audience = audience;
        a.startsAt = instant(body.get("startsAt")) != null ? instant(body.get("startsAt")) : Instant.now();
        a.endsAt = instant(body.get("endsAt"));
        if (a.endsAt != null && !a.endsAt.isAfter(a.startsAt)) throw ApiException.invalid("The end must be after the start");
        a.createdBy = author;
        a.createdAt = Instant.now();
        announcements.save(a);
        return announcement(a);
    }

    @Transactional
    public void endAnnouncement(UUID id) {
        me();
        PlatformAnnouncement a = announcements.findById(id).orElseThrow(() -> ApiException.notFound("Announcement"));
        a.endsAt = Instant.now();
        announcements.save(a);
    }

    /** Announcements for the signed-in customer's workspace (any authenticated user). */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> activeFor(UUID tenantId) {
        Tenant t = tenants.findById(tenantId).orElse(null);
        if (t == null || platformCode.equals(t.code)) return List.of();
        boolean trial = "TRIAL".equals(t.plan);
        Instant now = Instant.now();
        return announcements.findAllByOrderByStartsAtDesc().stream()
                .filter(a -> !a.startsAt.isAfter(now) && (a.endsAt == null || a.endsAt.isAfter(now)))
                .filter(a -> "ALL".equals(a.audience) || ("TRIAL".equals(a.audience) && trial) || ("PAYING".equals(a.audience) && !trial))
                .map(ConsoleService::announcement).toList();
    }

    private static Map<String, Object> announcement(PlatformAnnouncement a) {
        Map<String, Object> m = new LinkedHashMap<>();
        Instant now = Instant.now();
        m.put("id", a.id.toString()); m.put("title", a.title); m.put("body", a.body); m.put("level", a.level); m.put("audience", a.audience);
        m.put("startsAt", a.startsAt.toString()); m.put("endsAt", a.endsAt == null ? null : a.endsAt.toString());
        m.put("live", !a.startsAt.isAfter(now) && (a.endsAt == null || a.endsAt.isAfter(now)));
        m.put("createdBy", a.createdBy);
        return m;
    }

    // ------------------------------------------------------------------ operators, audit, health

    @Transactional(readOnly = true)
    public List<Map<String, Object>> operatorList() {
        platform.requireOperator();
        UUID pid = tenants.findByCode(platformCode).map(t -> t.id).orElseThrow();
        List<Map<String, Object>> out = new ArrayList<>();
        for (AppUser u : users.findByTenantId(pid)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", u.id.toString()); m.put("fullName", u.fullName); m.put("email", u.email); m.put("role", u.role);
            m.put("status", u.status); m.put("mfa", u.mfaEnrolledAt != null); m.put("lastLoginAt", u.lastLoginAt == null ? null : u.lastLoginAt.toString());
            out.add(m);
        }
        return out;
    }

    @Transactional
    public List<Map<String, Object>> addOperator(String email, String name) {
        me();
        operators.addOperator(email, name);
        return operatorList();
    }

    @Transactional
    public List<Map<String, Object>> setOperatorStatus(UUID userId, boolean active) {
        Principal p = platform.requireOperator();
        UUID pid = tenants.findByCode(platformCode).map(t -> t.id).orElseThrow();
        AppUser u = users.findById(userId).filter(x -> pid.equals(x.tenantId)).orElseThrow(() -> ApiException.notFound("Operator"));
        if (u.id.equals(p.userId()) && !active) throw ApiException.guard("SELF_DISABLE", "You cannot disable your own operator account");
        u.status = active ? "ACTIVE" : "SUSPENDED";
        if (!active) u.tokensValidAfter = Instant.now();
        users.save(u);
        return operatorList();
    }

    /** Every operator action recorded across all companies (suspensions, plan changes, support sessions…). */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> operatorAudit() {
        platform.requireOperator();
        return em.createQuery("select a from AuditEvent a where a.actor like 'OPES operator%' order by a.occurredAt desc", AuditEvent.class)
                .setMaxResults(200).getResultList().stream().map(a -> {
                    Map<String, Object> m = audit(a);
                    m.put("company", tenants.findById(a.tenantId).map(t -> t.legalName).orElse("?"));
                    return m;
                }).toList();
    }

    /** Not transactional: an optional probe (e.g. database size) that fails must not poison a transaction. */
    public Map<String, Object> health() {
        platform.requireOperator();
        Runtime rt = Runtime.getRuntime();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("uptime", Duration.ofMillis(ManagementFactory.getRuntimeMXBean().getUptime()).truncatedTo(ChronoUnit.MINUTES).toString().substring(2).toLowerCase(Locale.ROOT));
        m.put("startedAt", Instant.ofEpochMilli(ManagementFactory.getRuntimeMXBean().getStartTime()).toString());
        m.put("javaVersion", System.getProperty("java.version"));
        m.put("processors", rt.availableProcessors());
        m.put("memoryUsedMb", (rt.totalMemory() - rt.freeMemory()) / (1024 * 1024));
        m.put("memoryMaxMb", rt.maxMemory() / (1024 * 1024));
        try {
            Object size = em.createNativeQuery("select pg_size_pretty(pg_database_size(current_database()))").getSingleResult();
            m.put("databaseSize", String.valueOf(size));
        } catch (RuntimeException e) {
            m.put("databaseSize", "n/a");
        }
        try {
            Object schema = em.createNativeQuery("select max(cast(version as integer)) from flyway_schema_history where success").getSingleResult();
            m.put("schemaVersion", "V" + schema);
        } catch (RuntimeException e) {
            m.put("schemaVersion", "n/a");
        }
        m.put("catalogVersion", catalog.version());
        m.put("serverTime", Instant.now().toString());
        return m;
    }

    // ------------------------------------------------------------------ helpers

    private Tenant guardCustomer(UUID tenantId) {
        Tenant t = tenants.findById(tenantId).orElseThrow(() -> ApiException.notFound("Company"));
        if (platformCode.equals(t.code)) throw ApiException.notFound("Company");
        return t;
    }

    private static Map<String, Object> audit(AuditEvent a) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("occurredAt", a.occurredAt == null ? null : a.occurredAt.toString());
        m.put("actor", a.actor); m.put("action", a.action); m.put("entityType", a.entityType); m.put("detail", a.detail);
        return m;
    }

    private static String str(Object o) {
        if (o == null) return null;
        String s = o.toString().trim();
        return s.isEmpty() || "null".equals(s) ? null : s;
    }

    private static LocalDate date(Object o) {
        String s = str(o);
        return s == null ? null : LocalDate.parse(s.length() > 10 ? s.substring(0, 10) : s);
    }

    private static Instant instant(Object o) {
        String s = str(o);
        if (s == null) return null;
        return s.length() <= 16 ? java.time.LocalDateTime.parse(s.length() == 10 ? s + "T00:00" : s).toInstant(ZoneOffset.UTC) : Instant.parse(s);
    }

    private static String s(LocalDate d) {
        return d == null ? null : d.toString();
    }
}
