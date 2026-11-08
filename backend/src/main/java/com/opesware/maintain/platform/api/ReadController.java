package com.opesware.maintain.platform.api;

import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.application.FieldDef;
import com.opesware.maintain.platform.application.ResourceDef;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;

/** Shared read surface: list, read, options and CSV export. Read-only resources change only via domain commands. */
public abstract class ReadController {
    protected final CrudService crud;
    protected final String path;

    protected ReadController(CrudService crud, String path) {
        this.crud = crud;
        this.path = path;
    }

    @GetMapping
    public Map<String, Object> list(@RequestParam Map<String, String> params) {
        return crud.list(path, params);
    }

    @GetMapping("/options")
    public List<Map<String, Object>> options(@RequestParam(required = false) String q,
                                             @RequestParam(required = false) String field,
                                             @RequestParam(required = false) String value) {
        return crud.options(path, q, field, value);
    }

    @GetMapping(value = "/export.csv", produces = "text/csv")
    public ResponseEntity<byte[]> export(@RequestParam Map<String, String> params) {
        Map<String, String> p = new HashMap<>(params);
        p.put("size", "500");
        ResourceDef def = crud.def(path);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) crud.list(path, p).get("items");
        StringBuilder sb = new StringBuilder();
        List<FieldDef> cols = def.fields().stream().filter(f -> !f.hidden()).toList();
        sb.append(String.join(",", cols.stream().map(f -> csv(f.label())).toList())).append("\r\n");
        for (Map<String, Object> row : items) {
            sb.append(String.join(",", cols.stream().map(f -> {
                Object v = f.ref() != null ? row.get(f.name() + "Label") : row.get(f.name());
                return csv(v == null ? "" : v.toString());
            }).toList())).append("\r\n");
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + path + ".csv\"")
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .body(sb.toString().getBytes(StandardCharsets.UTF_8));
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> get(@PathVariable UUID id) {
        Map<String, Object> m = crud.get(path, id);
        return ResponseEntity.ok().eTag("\"" + m.get("version") + "\"").body(m);
    }

    private static String csv(String s) {
        String safe = s;
        if (!safe.isEmpty() && "=+-@".indexOf(safe.charAt(0)) >= 0) safe = "'" + safe; // formula-injection guard
        return "\"" + safe.replace("\"", "\"\"") + "\"";
    }
}
