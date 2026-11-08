package com.opesware.maintain.maintenance.api;

import com.opesware.maintain.maintenance.application.PmService;
import com.opesware.maintain.maintenance.application.RequestService;
import com.opesware.maintain.maintenance.application.WorkOrderService;
import com.opesware.maintain.maintenance.domain.WorkOrder;
import com.opesware.maintain.platform.application.CrudService;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Explicit lifecycle commands for requests, work orders and PM plans (spec §8.2). */
@RestController
@RequestMapping("/api/v1")
public class MaintenanceCommandController {
    private final CrudService crud;
    private final WorkOrderService workOrders;
    private final RequestService requests;
    private final PmService pm;

    public MaintenanceCommandController(CrudService crud, WorkOrderService workOrders, RequestService requests, PmService pm) {
        this.crud = crud;
        this.workOrders = workOrders;
        this.requests = requests;
        this.pm = pm;
    }

    // ---- work orders
    @GetMapping("/work-orders/{id}/transitions")
    public List<String> transitions(@PathVariable UUID id) {
        return workOrders.availableTransitions(id);
    }

    @PostMapping("/work-orders/{id}:transition")
    public Map<String, Object> transition(@PathVariable UUID id, @RequestBody Map<String, Object> body,
                                          @RequestHeader(value = "If-Match", required = false) String ifMatch) {
        Object target = body.get("to");
        WorkOrder wo = workOrders.transition(id, target == null ? "" : target.toString(), ifMatch, body);
        return crud.get("work-orders", wo.id);
    }

    @PostMapping("/work-orders/{id}:reopen")
    public Map<String, Object> reopen(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        return crud.get("work-orders", workOrders.reopen(id, body).id);
    }

    @PostMapping("/work-orders/{id}/tasks/{taskId}:record")
    public Map<String, Object> recordTask(@PathVariable UUID id, @PathVariable UUID taskId, @RequestBody Map<String, Object> body) {
        return crud.get("work-tasks", workOrders.recordTask(id, taskId, body).id);
    }

    @GetMapping("/work-orders/{id}/costs")
    public Map<String, Object> costs(@PathVariable UUID id) {
        return workOrders.costs(id);
    }

    // ---- requests
    @PostMapping("/maintenance-requests/{id}:acknowledge")
    public Map<String, Object> acknowledge(@PathVariable UUID id) {
        return crud.get("maintenance-requests", requests.acknowledge(id).id);
    }

    @PostMapping("/maintenance-requests/{id}:triage")
    public Map<String, Object> triage(@PathVariable UUID id, @RequestBody(required = false) Map<String, Object> body) {
        return crud.get("maintenance-requests", requests.triage(id, body).id);
    }

    @PostMapping("/maintenance-requests/{id}:reject")
    public Map<String, Object> reject(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        return crud.get("maintenance-requests", requests.reject(id, body).id);
    }

    @PostMapping("/maintenance-requests/{id}:link-duplicate")
    public Map<String, Object> duplicate(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        return crud.get("maintenance-requests", requests.linkDuplicate(id, UUID.fromString(String.valueOf(body.get("originalId")))).id);
    }

    @PostMapping("/maintenance-requests/{id}:convert")
    public Map<String, Object> convert(@PathVariable UUID id, @RequestBody(required = false) Map<String, Object> body) {
        return crud.get("work-orders", requests.convert(id, body).id);
    }

    // ---- PM
    @PostMapping("/pm-plans/{id}:{action}")
    public Map<String, Object> pmCommand(@PathVariable UUID id, @PathVariable String action) {
        if ("generate".equals(action)) return crud.get("work-orders", pm.generateNow(id).id);
        return crud.get("pm-plans", pm.command(id, action).id);
    }

    @GetMapping("/pm-plans/{id}/forecast")
    public List<Map<String, Object>> forecast(@PathVariable UUID id, @RequestParam(defaultValue = "6") int count) {
        return pm.forecast(id, Math.min(count, 24));
    }
}
