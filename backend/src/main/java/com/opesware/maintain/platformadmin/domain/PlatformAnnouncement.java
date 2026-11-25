package com.opesware.maintain.platformadmin.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** A message shown inside customer workspaces (maintenance windows, new features, notices). */
@Entity
@Table(name = "platform_announcement")
public class PlatformAnnouncement {
    @Id
    public UUID id;
    public String title;
    public String body;
    public String level;
    public String audience;
    public Instant startsAt;
    public Instant endsAt;
    public String createdBy;
    public Instant createdAt;
}
