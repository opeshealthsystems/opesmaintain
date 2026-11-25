package com.opesware.maintain.documents.application;

import com.opesware.maintain.documents.domain.Document;
import com.opesware.maintain.documents.infrastructure.DocumentRepository;
import com.opesware.maintain.documents.infrastructure.FileStore;
import com.opesware.maintain.platform.application.Access;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.application.ResourceCatalog;
import com.opesware.maintain.platform.security.CurrentUser;
import java.io.IOException;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * Staged evidence (spec §12.3): SHA-256 at upload, content-type allow-list, malware scan before
 * acceptance, storage through the {@link FileStore} port and checksum verification on every download.
 */
@Service
public class DocumentService {
    static final Set<String> ALLOWED = Set.of("application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain", "text/csv",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    private final CrudService crud;
    private final FileStore store;
    private final MalwareScanner scanner;
    private final DocumentRepository documents;

    public DocumentService(CrudService crud, FileStore store, MalwareScanner scanner, DocumentRepository documents) {
        this.crud = crud;
        this.store = store;
        this.scanner = scanner;
        this.documents = documents;
    }

    @Transactional
    public Document upload(UUID documentId, MultipartFile file) throws IOException {
        Document d = crud.load(Document.class, documentId);
        Access.canWrite(ResourceCatalog.get("documents"));
        if (file.isEmpty()) throw ApiException.invalid("File is empty");
        byte[] data = file.getBytes();
        String type = file.getContentType() == null ? "application/octet-stream" : file.getContentType();
        String key = CurrentUser.requireTenant() + "/" + UUID.randomUUID();
        store.put(key, data, type);
        String previous = d.storageKey;
        d.storageKey = key;
        d.fileName = sanitize(file.getOriginalFilename());
        d.contentType = type;
        d.sizeBytes = data.length;
        d.checksumSha256 = sha256(data);
        String reason;
        if (!ALLOWED.contains(type)) {
            d.status = "QUARANTINED";
            reason = "content type not allowed";
        } else {
            MalwareScanner.Verdict v = scanner.scan(data, type);
            d.status = switch (v.result()) {
                case CLEAN -> "ACCEPTED";
                case INFECTED -> "QUARANTINED";
                case UNAVAILABLE -> "SCANNING";
            };
            reason = v.reason();
        }
        return crud.saveDomain(d, previous == null ? "UPLOAD" : "REPLACE_FILE", "DocumentRegistered.v1",
                Map.of("checksum", d.checksumSha256, "status", d.status, "scan", reason, "store", store.kind()));
    }

    /** Re-scans documents held because the scanner was unavailable. */
    @Transactional
    public int rescanPending(UUID tenant) {
        int n = 0;
        for (Document d : documents.findByTenantId(tenant)) {
            if (!"SCANNING".equals(d.status) || d.storageKey == null) continue;
            try {
                MalwareScanner.Verdict v = scanner.scan(store.get(d.storageKey), d.contentType);
                if (v.result() == MalwareScanner.Result.UNAVAILABLE) continue;
                d.status = v.clean() ? "ACCEPTED" : "QUARANTINED";
                crud.saveDomain(d, "RESCAN", "DocumentScanned.v1", Map.of("scan", v.reason()));
                n++;
            } catch (IOException e) {
                // storage temporarily unavailable; retried on the next run
            }
        }
        return n;
    }

    @Transactional(readOnly = true)
    public Object[] download(UUID documentId) throws IOException {
        Document d = crud.load(Document.class, documentId);
        if (d.storageKey == null) throw ApiException.notFound("File");
        if (!"ACCEPTED".equals(d.status)) throw ApiException.guard("FILE_NOT_AVAILABLE", "File is " + d.status.toLowerCase() + " and cannot be downloaded");
        if (Boolean.TRUE.equals(d.confidential) && !CurrentUser.require().is("ADMIN", "MANAGER", "AUDITOR", "SAFETY_OFFICER", "CALIBRATION_OFFICER")) {
            throw ApiException.forbidden("Confidential document");
        }
        byte[] data = store.get(d.storageKey);
        if (!sha256(data).equals(d.checksumSha256)) throw new ApiException(500, "INTEGRITY_FAILURE", "Stored file failed its integrity check; contact support");
        return new Object[]{d, data};
    }

    static String sha256(byte[] data) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static String sanitize(String name) {
        if (name == null) return "file";
        String n = name.replaceAll("[\\\\/]", "_").replaceAll("[^A-Za-z0-9._ -]", "_");
        return n.length() > 180 ? n.substring(n.length() - 180) : n;
    }
}
