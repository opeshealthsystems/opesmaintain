package com.opesware.maintain.platformadmin.api;

import com.opesware.maintain.platformadmin.application.ConsoleService;
import com.opesware.maintain.platformadmin.application.PlatformService;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** OPES operator console. Every call checks that the caller is a platform operator (others get 404). */
@RestController
@RequestMapping("/api/v1/platform")
public class PlatformController {
    private final PlatformService platform;
    private final ConsoleService console;

    public PlatformController(PlatformService platform, ConsoleService console) {
        this.platform = platform;
        this.console = console;
    }

    // ---- dashboard
    @GetMapping("/counters")
    public Map<String, Object> counters() { return console.counters(); }

    @GetMapping("/growth")
    public Map<String, Object> growth() { return console.growth(); }

    // ---- company detail tabs
    @GetMapping("/companies/{id}/users")
    public List<Map<String, Object>> companyUsers(@PathVariable UUID id) { return console.companyUsers(id); }

    @GetMapping("/companies/{id}/usage")
    public Map<String, Object> companyUsage(@PathVariable UUID id) { return console.companyUsage(id); }

    @GetMapping("/companies/{id}/activity")
    public List<Map<String, Object>> companyActivity(@PathVariable UUID id) { return console.companyActivity(id); }

    @GetMapping("/companies/{id}/notes")
    public List<Map<String, Object>> notes(@PathVariable UUID id) { return console.notes(id); }

    @PostMapping("/companies/{id}/notes")
    public List<Map<String, Object>> addNote(@PathVariable UUID id, @RequestBody Map<String, String> body) { return console.addNote(id, body.get("body")); }

    // ---- support desk
    @GetMapping("/tickets")
    public List<Map<String, Object>> tickets(@RequestParam(required = false) String status, @RequestParam(required = false) UUID tenantId) {
        return console.tickets(status, tenantId);
    }

    @GetMapping("/tickets/{id}")
    public Map<String, Object> ticket(@PathVariable UUID id) { return console.ticketDetail(id); }

    @PostMapping("/tickets")
    public Map<String, Object> createTicket(@RequestBody Map<String, Object> body) { return console.createTicket(body); }

    @PostMapping("/tickets/{id}:update")
    public Map<String, Object> updateTicket(@PathVariable UUID id, @RequestBody Map<String, Object> body) { return console.updateTicket(id, body); }

    // ---- billing
    @GetMapping("/invoices")
    public List<Map<String, Object>> invoices(@RequestParam(required = false) UUID tenantId) { return console.invoices(tenantId); }

    @PostMapping("/invoices")
    public Map<String, Object> createInvoice(@RequestBody Map<String, Object> body) { return console.createInvoice(body); }

    @PostMapping("/invoices/{id}:status")
    public Map<String, Object> invoiceStatus(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        return console.setInvoiceStatus(id, body.get("status"), body.get("reference"));
    }

    @GetMapping("/revenue")
    public Map<String, Object> revenue() { return console.revenue(); }

    // ---- announcements
    @GetMapping("/announcements")
    public List<Map<String, Object>> announcements() { return console.announcements(); }

    @PostMapping("/announcements")
    public Map<String, Object> createAnnouncement(@RequestBody Map<String, Object> body) { return console.createAnnouncement(body); }

    @PostMapping("/announcements/{id}:end")
    public Map<String, Object> endAnnouncement(@PathVariable UUID id) { console.endAnnouncement(id); return Map.of("ok", true); }

    // ---- operators, audit, health
    @GetMapping("/operators")
    public List<Map<String, Object>> operators() { return console.operatorList(); }

    @PostMapping("/operators")
    public List<Map<String, Object>> addOperator(@RequestBody Map<String, String> body) { return console.addOperator(body.get("email"), body.get("fullName")); }

    @PostMapping("/operators/{id}:{action}")
    public List<Map<String, Object>> operatorStatus(@PathVariable UUID id, @PathVariable String action) {
        return console.setOperatorStatus(id, "enable".equals(action));
    }

    @GetMapping("/audit")
    public List<Map<String, Object>> audit() { return console.operatorAudit(); }

    @GetMapping("/health")
    public Map<String, Object> health() { return console.health(); }

    @GetMapping("/overview")
    public Map<String, Object> overview() { return platform.overview(); }

    @GetMapping("/companies")
    public List<Map<String, Object>> companies(@RequestParam(required = false) String q, @RequestParam(required = false) String status) {
        return platform.companies(q, status);
    }

    @GetMapping("/companies/{id}")
    public Map<String, Object> company(@PathVariable UUID id) { return platform.company(id); }

    @PostMapping("/companies/{id}:suspend")
    public Map<String, Object> suspend(@PathVariable UUID id, @RequestBody Map<String, String> body) { return platform.suspend(id, body.get("reason")); }

    @PostMapping("/companies/{id}:reactivate")
    public Map<String, Object> reactivate(@PathVariable UUID id) { return platform.reactivate(id); }

    @PostMapping("/companies/{id}:extend-trial")
    public Map<String, Object> extendTrial(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        return platform.extendTrial(id, Integer.parseInt(String.valueOf(body.getOrDefault("days", "14"))));
    }

    @PostMapping("/companies/{id}:set-plan")
    public Map<String, Object> setPlan(@PathVariable UUID id, @RequestBody Map<String, Object> body) { return platform.setPlan(id, body); }

    @PostMapping("/companies/{id}:support-session")
    public Map<String, Object> support(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        return platform.supportSession(id, String.valueOf(body.getOrDefault("reason", "")), Integer.parseInt(String.valueOf(body.getOrDefault("minutes", "60"))));
    }

    @GetMapping("/signups")
    public List<Map<String, Object>> signups() { return platform.pendingSignups(); }

    @PostMapping("/signups:decide")
    public Map<String, Object> decide(@RequestBody Map<String, String> body) { return platform.decideSignup(body.get("email"), body.get("action")); }

    @GetMapping("/messages")
    public List<Map<String, Object>> messages(@RequestParam(defaultValue = "false") boolean all) { return platform.messages(all); }

    @PostMapping("/messages:read")
    public Map<String, Object> read() { return platform.markMessagesRead(); }
}
