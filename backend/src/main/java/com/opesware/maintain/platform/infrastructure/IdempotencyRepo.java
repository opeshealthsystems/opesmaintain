package com.opesware.maintain.platform.infrastructure;

import com.opesware.maintain.platform.domain.IdempotencyRecord;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface IdempotencyRepo extends JpaRepository<IdempotencyRecord, UUID> {
    Optional<IdempotencyRecord> findByTenantIdAndScopeAndIdemKey(UUID tenantId, String scope, String idemKey);
}
