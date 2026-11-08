package com.opesware.maintain.procurement.api;

import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.procurement.application.ProcurementService;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class ProcurementCommandController {
    private final ProcurementService service;
    private final CrudService crud;

    public ProcurementCommandController(ProcurementService service, CrudService crud) {
        this.service = service;
        this.crud = crud;
    }

    @PostMapping("/purchase-requisitions/{id}:convert")
    public Map<String, Object> convert(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        return crud.get("purchase-orders", service.convert(id, UUID.fromString(String.valueOf(body.get("vendorId")))).id);
    }

    @PostMapping("/purchase-requisitions/{id}:{action}")
    public Map<String, Object> requisition(@PathVariable UUID id, @PathVariable String action) {
        return crud.get("purchase-requisitions", service.decide(id, action).id);
    }

    @PostMapping("/purchase-orders/{id}:{action}")
    public Map<String, Object> order(@PathVariable UUID id, @PathVariable String action, @RequestBody(required = false) Map<String, Object> body) {
        return crud.get("purchase-orders", service.order(id, action, body).id);
    }
}
