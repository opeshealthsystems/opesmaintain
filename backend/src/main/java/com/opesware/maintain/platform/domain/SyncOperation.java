package com.opesware.maintain.platform.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** Offline mobile operation receipt (spec §10); unique per tenant + client operation id. */
@Entity
@Table(name = "sync_operation")
public class SyncOperation {
    @Id
    public UUID id;
    public UUID tenantId;
    public String clientOperationId;
    public String deviceId;
    public String actor;
    public String operationType;
    public String outcome;
    @Column(length = 2000)
    public String message;
    public UUID resultId;
    public Instant receivedAt;
}
