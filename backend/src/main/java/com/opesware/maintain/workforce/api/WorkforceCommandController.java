package com.opesware.maintain.workforce.api;

import com.opesware.maintain.platform.application.Access;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.security.CurrentUser;
import com.opesware.maintain.workforce.domain.Technician;
import com.opesware.maintain.workforce.domain.TimeEntry;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Labor approval by a supervisor who did not log the time (spec §13.4, separation of duties). */
@RestController
@RequestMapping("/api/v1")
public class WorkforceCommandController {
    private final CrudService crud;

    public WorkforceCommandController(CrudService crud) {
        this.crud = crud;
    }

    @PostMapping("/time-entries/{id}:approve")
    @Transactional
    public Map<String, Object> approve(@PathVariable UUID id) {
        Access.requireRole("MANAGER", "PLANNER", "DISPATCHER");
        TimeEntry t = crud.load(TimeEntry.class, id);
        Technician tech = crud.load(Technician.class, t.technicianId);
        if (tech.userId != null && Objects.equals(tech.userId, CurrentUser.require().userId())) {
            throw ApiException.guard("SEPARATION_OF_DUTIES", "You cannot approve your own time");
        }
        if (Boolean.TRUE.equals(t.approved)) throw ApiException.guard("ALREADY_APPROVED", "Time entry already approved");
        t.approved = true;
        crud.saveDomain(t, "APPROVE", "TimeEntryApproved.v1", Map.of("hours", t.hours.toPlainString()));
        return crud.get("time-entries", id);
    }
}
