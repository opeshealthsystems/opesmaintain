package com.opesware.maintain.platformadmin.infrastructure;

import com.opesware.maintain.platformadmin.domain.CompanyNote;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CompanyNoteRepository extends JpaRepository<CompanyNote, UUID> {
    List<CompanyNote> findByTenantIdOrderByCreatedAtDesc(UUID tenantId);
}
