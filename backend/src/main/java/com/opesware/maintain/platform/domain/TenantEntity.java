package com.opesware.maintain.platform.domain;

import com.opesware.maintain.platform.security.CurrentUser;
import jakarta.persistence.Column;
import jakarta.persistence.Id;
import jakarta.persistence.MappedSuperclass;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;

/** Base for every tenant-owned aggregate: stable UUID, mandatory tenant, optimistic version. */
@MappedSuperclass
public abstract class TenantEntity {

    @Id
    public UUID id;

    @Column(nullable = false, updatable = false)
    public UUID tenantId;

    @Version
    public Long version;

    @Column(nullable = false, updatable = false)
    public Instant createdAt;

    @Column(nullable = false)
    public Instant updatedAt;

    @Column(updatable = false)
    public String createdBy;

    @PrePersist
    void onCreate() {
        if (id == null) id = UUID.randomUUID();
        if (tenantId == null) tenantId = CurrentUser.requireTenant();
        Instant now = Instant.now();
        if (createdAt == null) createdAt = now;
        updatedAt = now;
        if (createdBy == null) createdBy = CurrentUser.actorName();
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }
}
