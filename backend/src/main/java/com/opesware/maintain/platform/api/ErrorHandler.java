package com.opesware.maintain.platform.api;

import com.opesware.maintain.platform.application.ApiException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/** Standard error envelope (spec §8.4) with correlation id; no stack traces leak to clients. */
@RestControllerAdvice
public class ErrorHandler {
    private static final Logger log = LoggerFactory.getLogger(ErrorHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, Object>> api(ApiException e) {
        return body(e.status(), e.code(), e.getMessage(), e.errors());
    }

    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ResponseEntity<Map<String, Object>> stale(OptimisticLockingFailureException e) {
        return body(409, "CONCURRENT_MODIFICATION", "The record was modified concurrently. Reload and retry.", List.of());
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, Object>> integrity(DataIntegrityViolationException e) {
        log.info("Integrity violation: {}", e.getMostSpecificCause().getMessage());
        return body(409, "DUPLICATE_OR_CONFLICT", "A record with the same unique value already exists.", List.of());
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    public ResponseEntity<Map<String, Object>> bad(Exception e) {
        return body(400, "MALFORMED_REQUEST", "The request could not be read.", List.of());
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Map<String, Object>> missing(NoResourceFoundException e) {
        return body(404, "NOT_FOUND", "Endpoint not found", List.of());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> unexpected(Exception e) {
        String id = UUID.randomUUID().toString();
        log.error("Unhandled error {}", id, e);
        return body(500, "INTERNAL_ERROR", "Unexpected error. Reference " + id, List.of());
    }

    private ResponseEntity<Map<String, Object>> body(int status, String code, String detail, List<Map<String, String>> errors) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("type", "https://opesware.com/problems/" + code.toLowerCase().replace('_', '-'));
        m.put("title", code.replace('_', ' '));
        m.put("status", status);
        m.put("code", code);
        m.put("detail", detail);
        m.put("errors", errors);
        m.put("correlationId", UUID.randomUUID().toString());
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_PROBLEM_JSON).body(m);
    }
}
