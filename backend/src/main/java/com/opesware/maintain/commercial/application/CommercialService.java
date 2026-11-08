package com.opesware.maintain.commercial.application;

import com.opesware.maintain.commercial.domain.BillingExport;
import com.opesware.maintain.commercial.domain.Quote;
import com.opesware.maintain.commercial.domain.ServiceContract;
import com.opesware.maintain.commercial.domain.ServiceSignoff;
import com.opesware.maintain.maintenance.domain.WorkOrder;
import com.opesware.maintain.maintenance.infrastructure.WorkOrderRepository;
import com.opesware.maintain.platform.application.Access;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.Clock;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.application.ResourceHook;
import com.opesware.maintain.platform.security.CurrentUser;
import com.opesware.maintain.platform.security.Principal;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Quotes, contract billing exports and customer sign-off (OM-M17..M20). */
@Service
public class CommercialService {
    private final CrudService crud;
    private final WorkOrderRepository workOrders;

    public CommercialService(CrudService crud, WorkOrderRepository workOrders) {
        this.crud = crud;
        this.workOrders = workOrders;
    }

    @Transactional
    public Quote quote(UUID id, String action) {
        Principal p = CurrentUser.require();
        Quote q = crud.load(Quote.class, id);
        String from = q.status;
        switch (action) {
            case "send" -> {
                Access.requireRole("COMMERCIAL", "MANAGER");
                if (!"DRAFT".equals(from)) throw bad(q);
                q.status = "SENT";
            }
            case "approve", "reject" -> {
                if (!p.is("CUSTOMER")) Access.requireRole("COMMERCIAL", "MANAGER");
                if (!"SENT".equals(from)) throw bad(q);
                if (q.validUntil != null && q.validUntil.isBefore(LocalDate.now())) {
                    q.status = "EXPIRED";
                    crud.saveDomain(q, "EXPIRE", "QuoteExpired.v1", Map.of());
                    throw ApiException.guard("QUOTE_EXPIRED", "Quotation validity has ended");
                }
                q.status = "approve".equals(action) ? "APPROVED" : "REJECTED";
                q.approvedBy = p.name();
                q.approvedAt = Instant.now();
            }
            default -> throw ApiException.notFound("Action " + action);
        }
        return crud.saveDomain(q, action.toUpperCase(), "approve".equals(action) ? "QuoteApproved.v1" : "QuoteUpdated.v1", Map.of("from", from, "to", q.status));
    }

    /** Builds an idempotent billing batch from closed, unbilled work for a customer and period. */
    @Transactional
    public BillingExport generate(UUID id) {
        Access.requireRole("COMMERCIAL", "MANAGER");
        BillingExport b = crud.load(BillingExport.class, id);
        if (!"PENDING".equals(b.status)) throw ApiException.guard("INVALID_TRANSITION", "Export is " + b.status);
        Instant start = b.periodStart.atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant end = b.periodEnd.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        List<WorkOrder> scope = workOrders.findByCustomerId(b.customerId).stream()
                .filter(w -> "CLOSED".equals(w.status) && w.actualEnd != null && !w.actualEnd.isBefore(start) && w.actualEnd.isBefore(end))
                .filter(w -> b.contractId == null || Objects.equals(b.contractId, w.contractId)).toList();
        BigDecimal amount = BigDecimal.ZERO;
        for (WorkOrder w : scope) amount = amount.add(Clock.nz(w.laborCost)).add(Clock.nz(w.partsCost));
        if (b.contractId != null) {
            ServiceContract c = crud.load(ServiceContract.class, b.contractId);
            if (!"PER_JOB".equals(c.billingCycle) && c.value != null) {
                int months = switch (c.billingCycle == null ? "MONTHLY" : c.billingCycle) {
                    case "QUARTERLY" -> 3;
                    case "ANNUAL" -> 12;
                    default -> 1;
                };
                amount = amount.add(c.value.divide(BigDecimal.valueOf(12), 2, RoundingMode.HALF_UP).multiply(BigDecimal.valueOf(months)));
            }
        }
        b.workOrderCount = scope.size();
        b.amount = amount.setScale(2, RoundingMode.HALF_UP);
        b.externalRef = "OPES-" + b.number;
        return crud.saveDomain(b, "GENERATE", "BillingExportGenerated.v1", Map.of("count", scope.size(), "amount", b.amount.toPlainString()));
    }

    @Transactional
    public BillingExport billingStatus(UUID id, String status) {
        Access.requireRole("COMMERCIAL", "MANAGER");
        BillingExport b = crud.load(BillingExport.class, id);
        Set<String> allowed = switch (b.status) {
            case "PENDING" -> Set.of("ACKNOWLEDGED", "REJECTED");
            case "ACKNOWLEDGED" -> Set.of("REVERSED");
            default -> Set.of();
        };
        if (!allowed.contains(status)) throw ApiException.guard("INVALID_TRANSITION", "Cannot move export from " + b.status + " to " + status);
        String from = b.status;
        b.status = status;
        return crud.saveDomain(b, "STATUS", "BillingExport" + status.charAt(0) + status.substring(1).toLowerCase() + ".v1", Map.of("from", from));
    }

    private static ApiException bad(Quote q) {
        return ApiException.guard("INVALID_TRANSITION", "Quotation is " + q.status);
    }

    @Component
    public static class QuoteHook implements ResourceHook {
        @Override
        public String path() { return "quotes"; }

        @Override
        public void beforeCreate(Object e) {
            Quote q = (Quote) e;
            q.status = "DRAFT";
            total(q);
        }

        @Override
        public void beforeUpdate(Object e) {
            Quote q = (Quote) e;
            if (!"DRAFT".equals(q.status)) throw ApiException.guard("RECORD_LOCKED", "Only draft quotations can be edited");
            total(q);
        }

        private void total(Quote q) {
            BigDecimal net = Clock.nz(q.laborAmount).add(Clock.nz(q.partsAmount));
            BigDecimal tax = net.multiply(Clock.nz(q.taxRate)).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
            q.total = net.add(tax).setScale(2, RoundingMode.HALF_UP);
        }
    }

    @Component
    public static class ContractHook implements ResourceHook {
        @Override
        public String path() { return "service-contracts"; }

        @Override
        public void beforeCreate(Object e) { check((ServiceContract) e); }

        @Override
        public void beforeUpdate(Object e) { check((ServiceContract) e); }

        private void check(ServiceContract c) {
            if (c.endDate.isBefore(c.startDate)) throw ApiException.invalid("Contract end date must be after start date");
            if (c.status == null) c.status = "DRAFT";
        }
    }

    @Component
    public static class BillingHook implements ResourceHook {
        @Override
        public String path() { return "billing-exports"; }

        @Override
        public void beforeCreate(Object e) {
            BillingExport b = (BillingExport) e;
            if (b.periodEnd.isBefore(b.periodStart)) throw ApiException.invalid("Period end must be after start");
            b.status = "PENDING";
            b.workOrderCount = 0;
            b.amount = BigDecimal.ZERO;
            if (b.targetSystem == null) b.targetSystem = "OPES_ERP";
        }
    }

    @Component
    public static class SignoffHook implements ResourceHook {
        private final CrudService crud;

        public SignoffHook(CrudService crud) { this.crud = crud; }

        @Override
        public String path() { return "service-signoffs"; }

        @Override
        public void beforeCreate(Object e) {
            ServiceSignoff s = (ServiceSignoff) e;
            WorkOrder wo = crud.load(WorkOrder.class, s.workOrderId);
            if (!Set.of("WORK_COMPLETED", "REVIEWED", "CLOSED").contains(wo.status)) {
                throw ApiException.guard("WORK_NOT_COMPLETE", "Sign-off is possible only after the work is completed");
            }
            if (s.customerId == null) s.customerId = wo.customerId;
            s.signedAt = Instant.now();
            if (s.accepted == null) s.accepted = true;
            if (s.rating != null && (s.rating < 1 || s.rating > 5)) throw ApiException.invalid("Rating must be between 1 and 5");
        }
    }
}
