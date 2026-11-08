package com.opesware.maintain.calibration.api;

import com.opesware.maintain.calibration.application.CalibrationService;
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
public class CalibrationCommandController {
    private final CalibrationService service;
    private final CrudService crud;

    public CalibrationCommandController(CalibrationService service, CrudService crud) {
        this.service = service;
        this.crud = crud;
    }

    @PostMapping("/calibration-events/{id}:{action}")
    public Map<String, Object> command(@PathVariable UUID id, @PathVariable String action, @RequestBody(required = false) Map<String, Object> body) {
        return crud.get("calibration-events", service.command(id, action, body).id);
    }
}
