package com.opesware.maintain.platformadmin.infrastructure;

import com.opesware.maintain.platformadmin.domain.SupportTicket;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SupportTicketRepository extends JpaRepository<SupportTicket, UUID> {
    List<SupportTicket> findAllByOrderByUpdatedAtDesc();
    List<SupportTicket> findByTenantIdOrderByUpdatedAtDesc(UUID tenantId);
    long countByStatusIn(java.util.Collection<String> statuses);
}
