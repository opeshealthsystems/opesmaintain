package com.opesware.maintain.platformadmin.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** A reply or internal note on a support ticket. */
@Entity
@Table(name = "support_ticket_note")
public class SupportTicketNote {
    @Id
    public UUID id;
    public UUID ticketId;
    public String author;
    public String body;
    public boolean internal;
    public Instant createdAt;
}
