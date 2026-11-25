package com.opesware.maintain.platformadmin.api;

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

    public PlatformController(PlatformService platform) {
        this.platform = platform;
    }

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
