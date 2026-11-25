package com.opesware.maintain.platformadmin.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** A support request handled by OPES operators (from the website, or opened manually). */
@Entity
@Table(name = "support_ticket")
public class SupportTicket {
    @Id
    public UUID id;
    public String number;
    public UUID tenantId;
    public String subject;
    public String requesterName;
    public String requesterEmail;
    public String requesterPhone;
    public String source;
    public String topic;
    public String status;
    public String priority;
    public String assignee;
    public Instant createdAt;
    public Instant updatedAt;
    public Instant resolvedAt;
}
