package com.opesware.maintain.platform.api;

import com.opesware.maintain.platform.application.CrudService;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;

/** Read surface plus idempotent create and If-Match versioned update. */
public abstract class CrudController extends ReadController {

    protected CrudController(CrudService crud, String path) {
        super(crud, path);
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> create(@RequestBody Map<String, Object> body,
                                                      @RequestHeader(value = "Idempotency-Key", required = false) String key) {
        return ResponseEntity.status(201).body(crud.create(path, body, key));
    }

    @PatchMapping("/{id}")
    public Map<String, Object> update(@PathVariable UUID id, @RequestBody Map<String, Object> body,
                                      @RequestHeader(value = "If-Match", required = false) String ifMatch) {
        return crud.update(path, id, body, ifMatch);
    }
}
