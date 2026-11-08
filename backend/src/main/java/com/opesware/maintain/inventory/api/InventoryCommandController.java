package com.opesware.maintain.inventory.api;

import com.opesware.maintain.inventory.application.InventoryService;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.CrudService;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Atomic stock commands; each accepts an Idempotency-Key / clientOperationId (spec §6.5). */
@RestController
@RequestMapping("/api/v1")
public class InventoryCommandController {
    private final InventoryService inv;
    private final CrudService crud;

    public InventoryCommandController(InventoryService inv, CrudService crud) {
        this.inv = inv;
        this.crud = crud;
    }

    @PostMapping("/stock-receipts")
    public Map<String, Object> receive(@RequestBody Map<String, Object> b, @RequestHeader(value = "Idempotency-Key", required = false) String key) {
        return crud.get("stock-movements", inv.receive(id(b, "partId"), id(b, "warehouseId"), dec(b, "quantity"), dec(b, "unitCost"), s(b, "reference"), op(b, key)).id);
    }

    @PostMapping("/stock-reservations")
    public Map<String, Object> reserve(@RequestBody Map<String, Object> b, @RequestHeader(value = "Idempotency-Key", required = false) String key) {
        return crud.get("stock-reservations", inv.reserve(id(b, "partId"), id(b, "warehouseId"), id(b, "workOrderId"), dec(b, "quantity"), op(b, key)).id);
    }

    @PostMapping("/stock-reservations/{id}:issue")
    public Map<String, Object> issue(@PathVariable UUID id, @RequestBody(required = false) Map<String, Object> b,
                                     @RequestHeader(value = "Idempotency-Key", required = false) String key) {
        return crud.get("stock-movements", inv.issue(id, b == null ? null : dec(b, "quantity"), op(b, key)).id);
    }

    @PostMapping("/stock-reservations/{id}:release")
    public Map<String, Object> release(@PathVariable UUID id) {
        return crud.get("stock-reservations", inv.release(id).id);
    }

    @PostMapping("/stock-returns")
    public Map<String, Object> ret(@RequestBody Map<String, Object> b, @RequestHeader(value = "Idempotency-Key", required = false) String key) {
        String wo = s(b, "workOrderId");
        return crud.get("stock-movements", inv.returnToStock(id(b, "partId"), id(b, "warehouseId"), wo == null ? null : UUID.fromString(wo), dec(b, "quantity"), s(b, "reason"), op(b, key)).id);
    }

    @PostMapping("/stock-adjustments")
    public Map<String, Object> adjust(@RequestBody Map<String, Object> b, @RequestHeader(value = "Idempotency-Key", required = false) String key) {
        return crud.get("stock-movements", inv.adjust(id(b, "partId"), id(b, "warehouseId"), dec(b, "quantity"), s(b, "reason"), op(b, key)).id);
    }

    @PostMapping("/stock-transfers")
    public List<Map<String, Object>> transfer(@RequestBody Map<String, Object> b, @RequestHeader(value = "Idempotency-Key", required = false) String key) {
        return inv.transfer(id(b, "partId"), id(b, "fromWarehouseId"), id(b, "toWarehouseId"), dec(b, "quantity"), op(b, key))
                .stream().map(m -> crud.get("stock-movements", m.id)).toList();
    }

    @PostMapping("/cycle-counts/{id}:post")
    public Map<String, Object> post(@PathVariable UUID id) {
        return crud.get("cycle-counts", inv.postCycleCount(id).id);
    }

    @GetMapping("/parts/{id}/stock")
    public List<Map<String, Object>> partStock(@PathVariable UUID id) {
        return inv.stockByWarehouse(id);
    }

    @GetMapping("/warehouses/{id}/stock")
    public List<Map<String, Object>> warehouseStock(@PathVariable UUID id) {
        return inv.warehouseStock(id);
    }

    private static String op(Map<String, Object> b, String header) {
        String v = b == null ? null : s(b, "clientOperationId");
        return v != null ? v : header;
    }

    static String s(Map<String, Object> b, String k) {
        Object v = b == null ? null : b.get(k);
        return v == null || v.toString().isBlank() ? null : v.toString();
    }

    static UUID id(Map<String, Object> b, String k) {
        String v = s(b, k);
        if (v == null) throw ApiException.invalid(k + " is required");
        return UUID.fromString(v);
    }

    static BigDecimal dec(Map<String, Object> b, String k) {
        String v = s(b, k);
        return v == null ? null : new BigDecimal(v);
    }
}
