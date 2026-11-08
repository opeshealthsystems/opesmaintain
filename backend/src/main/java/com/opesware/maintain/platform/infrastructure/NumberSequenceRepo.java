package com.opesware.maintain.platform.infrastructure;

import com.opesware.maintain.platform.domain.NumberSequence;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

public interface NumberSequenceRepo extends JpaRepository<NumberSequence, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<NumberSequence> findByTenantIdAndPrefix(UUID tenantId, String prefix);
}
