package com.opesware.maintain.onboarding.infrastructure;

import com.opesware.maintain.onboarding.domain.SignupRequest;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SignupRequestRepository extends JpaRepository<SignupRequest, UUID> {
    Optional<SignupRequest> findFirstByEmailOrderByCreatedAtDesc(String email);
}
