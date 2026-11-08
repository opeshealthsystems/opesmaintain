package com.opesware.maintain.platform.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** Stores the outcome of an idempotent command so replays return the original result. */
@Entity
@Table(name = "idempotency_record")
public class IdempotencyRecord {
    @Id
    public UUID id;
    public UUID tenantId;
    public String idemKey;
    public String scope;
    public UUID resultId;
    public Instant createdAt;
}
