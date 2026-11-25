package com.opesware.maintain.platformadmin.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** An operator's private note about a customer company (never visible to the customer). */
@Entity
@Table(name = "company_note")
public class CompanyNote {
    @Id
    public UUID id;
    public UUID tenantId;
    public String author;
    public String body;
    public Instant createdAt;
}
