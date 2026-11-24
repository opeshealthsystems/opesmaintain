package com.opesware.maintain.onboarding.infrastructure;

import com.opesware.maintain.onboarding.domain.ContactMessage;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ContactMessageRepository extends JpaRepository<ContactMessage, UUID> {
    List<ContactMessage> findByStatusOrderByCreatedAtAsc(String status);

    List<ContactMessage> findTop50ByOrderByCreatedAtDesc();
}
