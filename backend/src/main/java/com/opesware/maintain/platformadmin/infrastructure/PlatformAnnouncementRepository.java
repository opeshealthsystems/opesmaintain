package com.opesware.maintain.platformadmin.infrastructure;

import com.opesware.maintain.platformadmin.domain.PlatformAnnouncement;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlatformAnnouncementRepository extends JpaRepository<PlatformAnnouncement, UUID> {
    List<PlatformAnnouncement> findAllByOrderByStartsAtDesc();
}
