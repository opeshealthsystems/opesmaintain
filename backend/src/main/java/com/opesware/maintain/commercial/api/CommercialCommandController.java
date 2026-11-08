package com.opesware.maintain.commercial.api;

import com.opesware.maintain.commercial.application.CommercialService;
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
public class CommercialCommandController {
    private final CommercialService service;
    private final CrudService crud;

    public CommercialCommandController(CommercialService service, CrudService crud) {
        this.service = service;
        this.crud = crud;
    }

    @PostMapping("/quotes/{id}:{action}")
    public Map<String, Object> quote(@PathVariable UUID id, @PathVariable String action) {
        return crud.get("quotes", service.quote(id, action).id);
    }

    @PostMapping("/billing-exports/{id}:generate")
    public Map<String, Object> generate(@PathVariable UUID id) {
        return crud.get("billing-exports", service.generate(id).id);
    }

    @PostMapping("/billing-exports/{id}:set-status")
    public Map<String, Object> status(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        return crud.get("billing-exports", service.billingStatus(id, String.valueOf(body.get("status"))).id);
    }
}
