package com.opesware.maintain.platform.application;

import com.opesware.maintain.integration.domain.OutboxEvent;
import com.opesware.maintain.integration.infrastructure.OutboxEventRepository;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Transactional outbox (spec §9.3): events are persisted atomically with the state change. */
@Service
public class OutboxService {
    private final OutboxEventRepository repo;

    public OutboxService(OutboxEventRepository repo) {
        this.repo = repo;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void publish(String eventType, String aggregateType, UUID aggregateId, Map<String, ?> data) {
        OutboxEvent e = new OutboxEvent();
        e.eventType = eventType;
        e.aggregateType = aggregateType;
        e.aggregateId = aggregateId.toString();
        e.status = "PENDING";
        e.attempts = 0;
        e.occurredAt = Instant.now();
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("eventId", UUID.randomUUID().toString());
        envelope.put("eventType", eventType);
        envelope.put("schemaVersion", 1);
        envelope.put("aggregateType", aggregateType);
        envelope.put("aggregateId", aggregateId.toString());
        envelope.put("occurredAt", e.occurredAt.toString());
        envelope.put("data", data == null ? Map.of() : data);
        String json = Json.write(envelope);
        e.payload = json.length() > 7900 ? json.substring(0, 7900) : json;
        repo.save(e);
    }
}
