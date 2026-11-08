package com.opesware.maintain.platform.infrastructure;

import com.opesware.maintain.platform.domain.Tenant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TenantRepo extends JpaRepository<Tenant, UUID> {
    Optional<Tenant> findByCode(String code);
}
