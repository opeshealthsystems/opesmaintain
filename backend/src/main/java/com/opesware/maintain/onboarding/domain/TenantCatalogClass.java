package com.opesware.maintain.onboarding.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** A catalog asset class a tenant manages (chosen during onboarding or later). */
@Entity
@Table(name = "tenant_catalog_class")
public class TenantCatalogClass {
    @Id
    public UUID id;
    public UUID tenantId;
    public String assetClassId;
    public String catalogVersion;
    public Instant createdAt;
}
