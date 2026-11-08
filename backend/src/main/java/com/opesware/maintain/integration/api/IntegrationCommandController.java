package com.opesware.maintain.integration.api;

import com.opesware.maintain.integration.application.IntegrationService;
import com.opesware.maintain.platform.application.CrudService;
import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class IntegrationCommandController {
    private final IntegrationService service;
    private final CrudService crud;

    public IntegrationCommandController(IntegrationService service, CrudService crud) {
        this.service = service;
        this.crud = crud;
    }

    @PostMapping("/sensors/{id}/readings")
    public Map<String, Object> ingest(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        Object v = body.get("value");
        return crud.get("sensors", service.ingest(id, v == null ? null : new BigDecimal(v.toString())).id);
    }

    @PostMapping("/sensor-alerts/{id}:{action}")
    public Map<String, Object> alert(@PathVariable UUID id, @PathVariable String action) {
        return crud.get("sensor-alerts", service.alert(id, action).id);
    }

    @PostMapping("/outbox-events/{id}:requeue")
    public Map<String, Object> requeue(@PathVariable UUID id) {
        return crud.get("outbox-events", service.requeue(id).id);
    }

    @PostMapping("/webhook-subscriptions/{id}:reveal-secret")
    public Map<String, Object> secret(@PathVariable UUID id) {
        return service.revealSecret(id);
    }

    @PostMapping("/integrations/{id}:test")
    public Map<String, Object> test(@PathVariable UUID id) {
        return crud.get("integrations", service.test(id).id);
    }
}
