package com.opesware.maintain.documents.api;

import com.opesware.maintain.documents.application.DocumentService;
import com.opesware.maintain.documents.application.ReportService;
import com.opesware.maintain.documents.domain.Document;
import com.opesware.maintain.platform.application.CrudService;
import java.io.IOException;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1")
public class DocumentCommandController {
    private final DocumentService documents;
    private final ReportService reports;
    private final CrudService crud;

    public DocumentCommandController(DocumentService documents, ReportService reports, CrudService crud) {
        this.documents = documents;
        this.reports = reports;
        this.crud = crud;
    }

    @PostMapping(value = "/documents/{id}/file", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> upload(@PathVariable UUID id, @RequestPart("file") MultipartFile file) throws IOException {
        return crud.get("documents", documents.upload(id, file).id);
    }

    @GetMapping("/documents/{id}/download")
    public ResponseEntity<byte[]> download(@PathVariable UUID id) throws IOException {
        Object[] r = documents.download(id);
        Document d = (Document) r[0];
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(d.fileName).build().toString())
                .header("X-Content-Type-Options", "nosniff")
                .contentType(MediaType.parseMediaType(d.contentType))
                .body((byte[]) r[1]);
    }

    @GetMapping("/reports/{type}")
    public Map<String, Object> report(@PathVariable String type, @RequestParam(required = false) LocalDate from,
                                      @RequestParam(required = false) LocalDate to) {
        LocalDate t = to == null ? LocalDate.now() : to;
        LocalDate f = from == null ? t.minusDays(90) : from;
        return reports.run(type, f, t);
    }
}
