package com.opesware.maintain.onboarding.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** A message from the public website contact form. Status: NEW or READ. */
@Entity
@Table(name = "contact_message")
public class ContactMessage {
    @Id
    public UUID id;
    public String name;
    public String email;
    public String phone;
    public String company;
    public String country;
    public String topic;
    public String language;
    public String message;
    public String status;
    public Instant createdAt;
}
