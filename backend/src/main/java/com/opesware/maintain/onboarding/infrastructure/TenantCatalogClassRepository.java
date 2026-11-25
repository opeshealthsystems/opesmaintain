package com.opesware.maintain.onboarding.infrastructure;

import com.opesware.maintain.onboarding.domain.TenantCatalogClass;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TenantCatalogClassRepository extends JpaRepository<TenantCatalogClass, UUID> {
    List<TenantCatalogClass> findByTenantIdOrderByCreatedAtAsc(UUID tenantId);
}
