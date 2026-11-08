package com.opesware.maintain.documents.application;

import com.opesware.maintain.documents.domain.Document;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.application.ResourceCatalog;
import com.opesware.maintain.platform.security.CurrentUser;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * Staged evidence storage with SHA-256 checksum, content-type allow list and quarantine of
 * disallowed files (spec §12.3). Local filesystem adapter; an S3-compatible adapter uses the same contract.
 */
@Service
public class DocumentService {
    private static final Set<String> ALLOWED = Set.of("application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain", "text/csv",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    private final CrudService crud;
    private final Path root;
    private final MalwareScanner scanner;

    public DocumentService(CrudService crud, @Value("${opes.storage.root}") String root, MalwareScanner scanner) {
        this.scanner = scanner;
        this.crud = crud;
        this.root = Path.of(root);
    }

    @Transactional
    public Document upload(UUID documentId, MultipartFile file) throws IOException {
        Document d = crud.load(Document.class, documentId);
        com.opesware.maintain.platform.application.Access.canWrite(ResourceCatalog.get("documents"));
        if (file.isEmpty()) throw ApiException.invalid("File is empty");
        String type = file.getContentType() == null ? "application/octet-stream" : file.getContentType();
        String key = CurrentUser.requireTenant() + "/" + UUID.randomUUID();
        Path target = root.resolve(key).normalize();
        if (!target.startsWith(root.normalize())) throw ApiException.invalid("Invalid storage path");
        Files.createDirectories(target.getParent());
        MessageDigest md;
        try {
            md = MessageDigest.getInstance("SHA-256");
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        try (InputStream in = new DigestInputStream(file.getInputStream(), md)) {
            Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
        }
        String previous = d.storageKey;
        d.storageKey = key;
        d.fileName = sanitize(file.getOriginalFilename());
        d.contentType = type;
        d.sizeBytes = (int) Math.min(Integer.MAX_VALUE, file.getSize());
        d.checksumSha256 = HexFormat.of().formatHex(md.digest());
        byte[] head;
        try (InputStream in = Files.newInputStream(target)) {
            head = in.readNBytes(4096);
        }
        MalwareScanner.Verdict v = scanner.scan(head, type);
        d.status = ALLOWED.contains(type) && v.clean() ? "ACCEPTED" : "QUARANTINED";
        return crud.saveDomain(d, previous == null ? "UPLOAD" : "REPLACE_FILE", "DocumentRegistered.v1",
                Map.of("checksum", d.checksumSha256, "status", d.status, "scan", ALLOWED.contains(type) ? v.reason() : "content type not allowed"));
    }

    @Transactional(readOnly = true)
    public Object[] download(UUID documentId) throws IOException {
        Document d = crud.load(Document.class, documentId);
        if (d.storageKey == null) throw ApiException.notFound("File");
        if (!"ACCEPTED".equals(d.status)) throw ApiException.guard("FILE_NOT_AVAILABLE", "File is " + d.status.toLowerCase() + " and cannot be downloaded");
        if (Boolean.TRUE.equals(d.confidential) && !CurrentUser.require().is("ADMIN", "MANAGER", "AUDITOR", "SAFETY_OFFICER", "CALIBRATION_OFFICER")) {
            throw ApiException.forbidden("Confidential document");
        }
        Path p = root.resolve(d.storageKey).normalize();
        return new Object[]{d, Files.readAllBytes(p)};
    }

    private static String sanitize(String name) {
        if (name == null) return "file";
        String n = name.replaceAll("[\\\\/]", "_").replaceAll("[^A-Za-z0-9._ -]", "_");
        return n.length() > 180 ? n.substring(n.length() - 180) : n;
    }
}
