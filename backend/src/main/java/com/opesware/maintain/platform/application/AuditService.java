package com.opesware.maintain.platform.application;

import com.opesware.maintain.platform.domain.AuditEvent;
import com.opesware.maintain.platform.infrastructure.AuditEventRepository;
import com.opesware.maintain.platform.security.CurrentUser;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Append-only audit writer; joins the caller's transaction (WO-INV-08). */
@Service
public class AuditService {
    private final AuditEventRepository repo;

    public AuditService(AuditEventRepository repo) {
        this.repo = repo;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void record(String action, String entityType, UUID entityId, Map<String, ?> detail) {
        AuditEvent e = new AuditEvent();
        e.occurredAt = Instant.now();
        e.actor = CurrentUser.actorName();
        e.action = action;
        e.entityType = entityType;
        e.entityId = entityId == null ? null : entityId.toString();
        String json = Json.write(detail == null ? Map.of() : detail);
        e.detail = json.length() > 7900 ? json.substring(0, 7900) : json;
        repo.save(e);
    }
}
