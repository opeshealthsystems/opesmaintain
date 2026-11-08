package com.opesware.maintain.platform.application;

import java.util.List;
import java.util.Map;

/** Maps to the standard error envelope (spec §8.4). */
public class ApiException extends RuntimeException {
    private final int status;
    private final String code;
    private final List<Map<String, String>> errors;

    public ApiException(int status, String code, String message) {
        this(status, code, message, List.of());
    }

    public ApiException(int status, String code, String message, List<Map<String, String>> errors) {
        super(message);
        this.status = status;
        this.code = code;
        this.errors = errors;
    }

    public int status() { return status; }
    public String code() { return code; }
    public List<Map<String, String>> errors() { return errors; }

    public static ApiException unauthorized() { return new ApiException(401, "UNAUTHENTICATED", "Authentication required"); }
    public static ApiException forbidden(String m) { return new ApiException(403, "FORBIDDEN", m); }
    public static ApiException notFound(String what) { return new ApiException(404, "NOT_FOUND", what + " not found"); }
    public static ApiException conflict(String code, String m) { return new ApiException(409, code, m); }
    public static ApiException invalid(String m) { return new ApiException(400, "VALIDATION_FAILED", m); }
    public static ApiException guard(String code, String m) { return new ApiException(422, code, m); }
}
