package com.opesware.maintain.platform.jobs;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.binder.MeterBinder;
import jakarta.persistence.EntityManagerFactory;
import java.util.function.Supplier;
import org.springframework.stereotype.Component;

/**
 * Platform-wide operational gauges for Prometheus (plan item D1). Counts are aggregated across
 * tenants and carry no tenant or personal data in labels.
 */
@Component
public class DomainMetrics implements MeterBinder {
    private final EntityManagerFactory emf;

    public DomainMetrics(EntityManagerFactory emf) {
        this.emf = emf;
    }

    @Override
    public void bindTo(MeterRegistry r) {
        gauge(r, "opes_outbox_events", "status", "pending", "select count(e) from OutboxEvent e where e.status = 'PENDING'");
        gauge(r, "opes_outbox_events", "status", "retry", "select count(e) from OutboxEvent e where e.status = 'RETRY'");
        gauge(r, "opes_outbox_events", "status", "dead_letter", "select count(e) from OutboxEvent e where e.status = 'DEAD_LETTER'");
        gauge(r, "opes_work_orders_open", "kind", "all", "select count(w) from WorkOrder w where w.status not in ('CLOSED','CANCELLED')");
        gauge(r, "opes_work_orders_open", "kind", "sla_breached", "select count(w) from WorkOrder w where w.status not in ('CLOSED','CANCELLED') and w.slaBreached = true");
        gauge(r, "opes_work_orders_open", "kind", "emergency", "select count(w) from WorkOrder w where w.status not in ('CLOSED','CANCELLED') and w.workType = 'EMERGENCY'");
        gauge(r, "opes_notifications_email", "status", "pending", "select count(n) from Notification n where n.emailStatus = 'PENDING'");
        gauge(r, "opes_notifications_email", "status", "failed", "select count(n) from Notification n where n.emailStatus = 'FAILED'");
        gauge(r, "opes_documents", "status", "scanning", "select count(d) from Document d where d.status = 'SCANNING'");
        gauge(r, "opes_documents", "status", "quarantined", "select count(d) from Document d where d.status = 'QUARANTINED'");
        gauge(r, "opes_users_locked", "kind", "locked", "select count(u) from AppUser u where u.lockedUntil > CURRENT_TIMESTAMP");
    }

    private void gauge(MeterRegistry r, String name, String tag, String value, String jpql) {
        Supplier<Number> q = () -> {
            var em = emf.createEntityManager();
            try {
                return em.createQuery(jpql, Long.class).getSingleResult();
            } catch (RuntimeException e) {
                return Double.NaN;
            } finally {
                em.close();
            }
        };
        Gauge.builder(name, q).tag(tag, value).strongReference(true).register(r);
    }
}
