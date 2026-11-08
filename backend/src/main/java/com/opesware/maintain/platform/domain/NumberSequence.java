package com.opesware.maintain.platform.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;

@Entity
@Table(name = "number_sequence")
public class NumberSequence {
    @Id
    public UUID id;
    public UUID tenantId;
    public String prefix;
    public Long nextValue;
}
