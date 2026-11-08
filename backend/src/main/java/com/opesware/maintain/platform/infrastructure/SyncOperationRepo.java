package com.opesware.maintain.platform.infrastructure;

import com.opesware.maintain.platform.domain.SyncOperation;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SyncOperationRepo extends JpaRepository<SyncOperation, UUID> {
    Optional<SyncOperation> findByTenantIdAndClientOperationId(UUID tenantId, String clientOperationId);
    List<SyncOperation> findTop50ByTenantIdAndActorOrderByReceivedAtDesc(UUID tenantId, String actor);
}
