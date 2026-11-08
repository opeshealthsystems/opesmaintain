package com.opesware.maintain.platform.security;

import com.opesware.maintain.identity.domain.AppUser;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Spec OM-M02-002: privileged roles must use multi-factor sign-in when the policy is enabled. */
@Component
public class MfaPolicy {
    public static final Set<String> PRIVILEGED = Set.of("ADMIN", "MANAGER", "SAFETY_OFFICER", "CALIBRATION_OFFICER", "AUDITOR");
    private final boolean required;

    public MfaPolicy(@Value("${opes.security.mfa-required:false}") boolean required) {
        this.required = required;
    }

    public boolean requiredFor(AppUser u) {
        return required && (PRIVILEGED.contains(u.role) || Boolean.TRUE.equals(u.mfaEnabled));
    }

    public boolean enrollmentRequired(AppUser u) {
        return requiredFor(u) && u.mfaEnrolledAt == null;
    }
}
