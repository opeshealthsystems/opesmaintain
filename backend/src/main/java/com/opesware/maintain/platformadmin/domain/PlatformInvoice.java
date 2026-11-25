package com.opesware.maintain.platformadmin.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** An invoice OPES issues to a customer company for its subscription or license. */
@Entity
@Table(name = "platform_invoice")
public class PlatformInvoice {
    @Id
    public UUID id;
    public String number;
    public UUID tenantId;
    public String description;
    public LocalDate periodStart;
    public LocalDate periodEnd;
    public BigDecimal amount;
    public String currency;
    public String status;
    public LocalDate issuedOn;
    public LocalDate dueOn;
    public LocalDate paidOn;
    public String paymentReference;
    public String createdBy;
    public Instant createdAt;
}
