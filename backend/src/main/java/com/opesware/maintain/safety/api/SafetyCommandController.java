package com.opesware.maintain.safety.api;

import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.safety.application.SafetyService;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class SafetyCommandController {
    private final SafetyService safety;
    private final CrudService crud;

    public SafetyCommandController(SafetyService safety, CrudService crud) {
        this.safety = safety;
        this.crud = crud;
    }

    @PostMapping("/work-permits/{id}:{action}")
    public Map<String, Object> permit(@PathVariable UUID id, @PathVariable String action, @RequestBody(required = false) Map<String, Object> body) {
        return crud.get("work-permits", safety.permit(id, action, body).id);
    }
}
