package com.opesware.maintain.commercial.application;

import com.opesware.maintain.commercial.domain.BillingExport;
import com.opesware.maintain.commercial.domain.Quote;
import com.opesware.maintain.commercial.domain.ServiceContract;
import com.opesware.maintain.platform.application.ResourceHook;
import com.opesware.maintain.platform.infrastructure.TenantRepo;
import com.opesware.maintain.platform.security.CurrentUser;
import org.springframework.stereotype.Component;

/**
 * Commercial documents created without a currency use the workspace currency (e.g. XAF), so quotations, contracts
 * and billing statements never print a blank currency. Found by the document-template check.
 */
public final class CurrencyDefaults {
    private CurrencyDefaults() {}

    static String workspaceCurrency(TenantRepo tenants) {
        return tenants.findById(CurrentUser.requireTenant()).map(t -> t.currency).filter(c -> c != null && !c.isBlank()).orElse("XAF");
    }

    @Component
    public static class QuoteCurrency implements ResourceHook {
        private final TenantRepo tenants;
        public QuoteCurrency(TenantRepo tenants) { this.tenants = tenants; }
        @Override public String path() { return "quotes"; }
        @Override public void beforeCreate(Object e) {
            Quote q = (Quote) e;
            if (q.currency == null || q.currency.isBlank()) q.currency = workspaceCurrency(tenants);
        }
    }

    @Component
    public static class ContractCurrency implements ResourceHook {
        private final TenantRepo tenants;
        public ContractCurrency(TenantRepo tenants) { this.tenants = tenants; }
        @Override public String path() { return "service-contracts"; }
        @Override public void beforeCreate(Object e) {
            ServiceContract c = (ServiceContract) e;
            if (c.currency == null || c.currency.isBlank()) c.currency = workspaceCurrency(tenants);
        }
    }

    @Component
    public static class BillingCurrency implements ResourceHook {
        private final TenantRepo tenants;
        public BillingCurrency(TenantRepo tenants) { this.tenants = tenants; }
        @Override public String path() { return "billing-exports"; }
        @Override public void beforeCreate(Object e) {
            BillingExport b = (BillingExport) e;
            if (b.currency == null || b.currency.isBlank()) b.currency = workspaceCurrency(tenants);
        }
    }
}
