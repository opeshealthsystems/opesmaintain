package com.opesware.maintain.onboarding.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * A company sign-up waiting for e-mail verification. Holds the already-hashed password and a hashed
 * one-time code; nothing tenant-scoped exists until the code is verified.
 */
@Entity
@Table(name = "signup_request")
public class SignupRequest {
    @Id
    public UUID id;
    public String email;
    public String fullName;
    public String companyName;
    public String country;
    public String phone;
    public String industry;
    public String planInterest;
    public String language;
    public String passwordHash;
    public String codeHash;
    public int attempts;
    public Instant expiresAt;
    public Instant createdAt;
    public Instant completedAt;
    public UUID tenantId;
    /** PENDING_CODE (waiting for the e-mailed code), PENDING_REVIEW (waiting for an operator), COMPLETED. */
    public String status;

    public boolean pending(Instant now) {
        return completedAt == null && expiresAt != null && expiresAt.isAfter(now);
    }
}
