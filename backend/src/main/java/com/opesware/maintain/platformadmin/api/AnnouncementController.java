package com.opesware.maintain.platformadmin.api;

import com.opesware.maintain.platform.security.CurrentUser;
import com.opesware.maintain.platformadmin.application.ConsoleService;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Announcements from OPES shown inside customer workspaces (maintenance windows, new features, notices). */
@RestController
public class AnnouncementController {
    private final ConsoleService console;

    public AnnouncementController(ConsoleService console) {
        this.console = console;
    }

    @GetMapping("/api/v1/announcements/active")
    public List<Map<String, Object>> active() {
        return console.activeFor(CurrentUser.requireTenant());
    }
}
