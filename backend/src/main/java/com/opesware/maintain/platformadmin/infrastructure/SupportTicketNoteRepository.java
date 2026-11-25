package com.opesware.maintain.platformadmin.infrastructure;

import com.opesware.maintain.platformadmin.domain.SupportTicketNote;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SupportTicketNoteRepository extends JpaRepository<SupportTicketNote, UUID> {
    List<SupportTicketNote> findByTicketIdOrderByCreatedAtAsc(UUID ticketId);
}
