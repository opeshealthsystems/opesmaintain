package com.opesware.maintain.onboarding.application;

import java.util.List;

/** Subscription plans offered on the landing page. Limits map to tenant.max_users / tenant.max_assets. */
public final class Plans {
    public record Plan(String code, String name, Integer maxUsers, Integer maxAssets, Integer trialDays, boolean selfService) {}

    public static final Plan TRIAL = new Plan("TRIAL", "Free trial", 10, 500, 30, true);
    public static final List<Plan> ALL = List.of(
            TRIAL,
            new Plan("STARTER", "Starter", 5, 250, null, true),
            new Plan("PROFESSIONAL", "Professional", 25, 2500, null, true),
            new Plan("ENTERPRISE", "Enterprise", null, null, null, false));

    private Plans() {}

    public static boolean known(String code) {
        return code != null && ALL.stream().anyMatch(p -> p.code().equals(code));
    }
}
