package com.opesware.maintain.platform.application;

import com.opesware.maintain.platform.domain.NumberSequence;
import com.opesware.maintain.platform.infrastructure.NumberSequenceRepo;
import com.opesware.maintain.platform.security.CurrentUser;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Gap-tolerant, per-tenant business numbers (WO-000123) under a row lock. */
@Service
public class NumberService {
    private final NumberSequenceRepo repo;

    public NumberService(NumberSequenceRepo repo) {
        this.repo = repo;
    }

    @Transactional
    public String next(String prefix) {
        UUID tenant = CurrentUser.requireTenant();
        NumberSequence seq = repo.findByTenantIdAndPrefix(tenant, prefix).orElseGet(() -> {
            NumberSequence s = new NumberSequence();
            s.id = UUID.randomUUID();
            s.tenantId = tenant;
            s.prefix = prefix;
            s.nextValue = 1L;
            return s;
        });
        long value = seq.nextValue;
        seq.nextValue = value + 1;
        repo.save(seq);
        return String.format("%s-%06d", prefix, value);
    }
}
