package com.opesware.maintain.platform.application;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;

public final class Clock {
    private Clock() {}

    public static BigDecimal hoursBetween(Instant a, Instant b) {
        if (a == null || b == null) return null;
        return BigDecimal.valueOf(Duration.between(a, b).toMinutes()).divide(BigDecimal.valueOf(60), 2, RoundingMode.HALF_UP);
    }

    public static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }
}
