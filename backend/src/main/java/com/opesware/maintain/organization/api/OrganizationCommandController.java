package com.opesware.maintain.organization.api;

import com.opesware.maintain.organization.application.OrganizationService;
import com.opesware.maintain.platform.application.CrudService;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class OrganizationCommandController {
    private final OrganizationService service;
    private final CrudService crud;

    public OrganizationCommandController(OrganizationService service, CrudService crud) {
        this.service = service;
        this.crud = crud;
    }

    @PostMapping("/service-grants/{id}:revoke")
    public Map<String, Object> revoke(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        Object reason = body.get("reason");
        return crud.get("service-grants", service.revoke(id, reason == null ? null : reason.toString()).id);
    }
}
