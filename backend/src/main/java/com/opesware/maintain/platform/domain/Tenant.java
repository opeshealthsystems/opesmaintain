package com.opesware.maintain.platform.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;

/** Subscription tenant (OM-M01-001). Not tenant-scoped itself. */
@Entity
@Table(name = "tenant")
public class Tenant {
    @Id
    public UUID id;
    public String code;
    public String legalName;
    public String country;
    public String timeZone;
    public String currency;
    public String language;
    public String plan;
    public String status;
    public Integer maxUsers;
    public Integer maxAssets;
    public Instant createdAt;
    @Version
    public Long version;
}
