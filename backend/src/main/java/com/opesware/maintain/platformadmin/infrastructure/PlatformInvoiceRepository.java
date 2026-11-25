package com.opesware.maintain.platformadmin.infrastructure;

import com.opesware.maintain.platformadmin.domain.PlatformInvoice;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlatformInvoiceRepository extends JpaRepository<PlatformInvoice, UUID> {
    List<PlatformInvoice> findAllByOrderByCreatedAtDesc();
    List<PlatformInvoice> findByTenantIdOrderByCreatedAtDesc(UUID tenantId);
}
