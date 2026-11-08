package com.opesware.maintain.integration.application;

import com.opesware.maintain.asset.domain.Asset;
import com.opesware.maintain.integration.domain.Integration;
import com.opesware.maintain.integration.domain.OutboxEvent;
import com.opesware.maintain.integration.domain.Sensor;
import com.opesware.maintain.integration.domain.SensorAlert;
import com.opesware.maintain.integration.domain.WebhookSubscription;
import com.opesware.maintain.integration.infrastructure.OutboxEventRepository;
import com.opesware.maintain.integration.infrastructure.WebhookSubscriptionRepository;
import com.opesware.maintain.maintenance.domain.WorkOrder;
import com.opesware.maintain.platform.application.Access;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.application.ResourceHook;
import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Read-only condition monitoring ingestion (no remote control of equipment, spec §2.1) and
 * outbox delivery bookkeeping (spec §9.3).
 */
@Service
public class IntegrationService {
    private final CrudService crud;
    private final OutboxEventRepository outbox;
    private final WebhookSubscriptionRepository webhooks;
    private final WebhookDelivery delivery;

    public IntegrationService(CrudService crud, OutboxEventRepository outbox, WebhookSubscriptionRepository webhooks, WebhookDelivery delivery) {
        this.crud = crud;
        this.outbox = outbox;
        this.webhooks = webhooks;
        this.delivery = delivery;
    }

    @Transactional
    public Sensor ingest(UUID sensorId, BigDecimal value) {
        Access.requireRole("MANAGER", "TECHNICIAN", "PLANNER");
        if (value == null) throw ApiException.invalid("value is required");
        Sensor s = crud.load(Sensor.class, sensorId);
        s.lastValue = value;
        s.lastSeenAt = Instant.now();
        String severity = null;
        BigDecimal threshold = null;
        if (s.alarmHigh != null && value.compareTo(s.alarmHigh) >= 0) { severity = "ALARM"; threshold = s.alarmHigh; }
        else if (s.alarmLow != null && value.compareTo(s.alarmLow) <= 0) { severity = "ALARM"; threshold = s.alarmLow; }
        else if (s.warnHigh != null && value.compareTo(s.warnHigh) >= 0) { severity = "WARNING"; threshold = s.warnHigh; }
        else if (s.warnLow != null && value.compareTo(s.warnLow) <= 0) { severity = "WARNING"; threshold = s.warnLow; }
        s.status = severity == null ? "ONLINE" : severity;
        crud.saveDomain(s, "SENSOR_READING", null, Map.of("value", value.toPlainString()));
        if (severity != null) {
            SensorAlert a = new SensorAlert();
            a.sensorId = s.id;
            a.assetId = s.assetId;
            a.severity = severity;
            a.value = value;
            a.threshold = threshold;
            a.raisedAt = Instant.now();
            a.status = "OPEN";
            crud.persistNew(a);
        }
        return s;
    }

    @Transactional
    public SensorAlert alert(UUID id, String action) {
        Access.requireRole("MANAGER", "TECHNICIAN", "PLANNER", "DISPATCHER");
        SensorAlert a = crud.load(SensorAlert.class, id);
        switch (action) {
            case "acknowledge" -> {
                if (!"OPEN".equals(a.status)) throw bad(a);
                a.status = "ACKNOWLEDGED";
            }
            case "clear" -> {
                if ("CONVERTED".equals(a.status) || "CLEARED".equals(a.status)) throw bad(a);
                a.status = "CLEARED";
            }
            case "convert" -> {
                if (a.workOrderId != null) return a;
                if ("CLEARED".equals(a.status)) throw bad(a);
                Asset asset = crud.load(Asset.class, a.assetId);
                Sensor s = crud.load(Sensor.class, a.sensorId);
                WorkOrder wo = new WorkOrder();
                wo.title = "Condition alert: " + s.name + " on " + asset.name;
                wo.description = s.sensorType + " reading " + a.value.toPlainString() + " " + (s.unit == null ? "" : s.unit)
                        + " crossed " + a.severity.toLowerCase() + " threshold " + a.threshold.toPlainString();
                wo.workType = "CORRECTIVE";
                wo.priority = "ALARM".equals(a.severity) ? "HIGH" : "MEDIUM";
                wo.assetId = asset.id;
                wo.siteId = asset.siteId;
                a.workOrderId = crud.persistNew(wo).id;
                a.status = "CONVERTED";
            }
            default -> throw ApiException.notFound("Action " + action);
        }
        return crud.saveDomain(a, action.toUpperCase(), "SensorAlert" + Character.toUpperCase(action.charAt(0)) + action.substring(1) + "ed.v1", Map.of());
    }

    @Transactional
    public Integration test(UUID id) {
        Access.requireRole("MANAGER");
        Integration i = crud.load(Integration.class, id);
        i.lastTestAt = Instant.now();
        boolean ok = i.endpoint != null && (i.endpoint.startsWith("https://") || i.endpoint.startsWith("opc.tcp://") || i.endpoint.startsWith("mqtts://"));
        i.lastTestResult = ok ? "Configuration valid (endpoint uses a secure scheme)" : "Endpoint must use https, mqtts or opc.tcp";
        if (!ok) i.status = "ERROR";
        return crud.saveDomain(i, "TEST", "IntegrationTested.v1", Map.of("ok", ok));
    }

    /** Maximum attempts before an event is parked as DEAD_LETTER for operator review. */
    public static final int MAX_ATTEMPTS = 8;

    /**
     * At-least-once delivery of outbox events to matching subscriptions with exponential backoff
     * (2^attempts minutes). Events without subscribers are marked delivered.
     */
    @Transactional
    public int dispatch(UUID tenant) {
        Instant now = Instant.now();
        List<OutboxEvent> pending = outbox.findByTenantId(tenant).stream()
                .filter(e -> "PENDING".equals(e.status) || ("RETRY".equals(e.status)
                        && e.occurredAt.plus(java.time.Duration.ofMinutes(1L << Math.min(e.attempts, 10))).isBefore(now)))
                .limit(200).toList();
        List<WebhookSubscription> subs = webhooks.findByTenantId(tenant).stream().filter(w -> "ACTIVE".equals(w.status)).toList();
        for (OutboxEvent e : pending) {
            e.attempts = (e.attempts == null ? 0 : e.attempts) + 1;
            boolean ok = true;
            for (WebhookSubscription w : subs) {
                if (w.eventTypes == null || !(w.eventTypes.contains("*") || w.eventTypes.contains(e.eventType))) continue;
                if (delivery.send(w, e.eventType, e.payload)) {
                    w.lastDeliveryAt = Instant.now();
                    webhooks.save(w);
                } else {
                    ok = false;
                }
            }
            e.status = ok ? "DELIVERED" : e.attempts >= MAX_ATTEMPTS ? "DEAD_LETTER" : "RETRY";
            outbox.save(e);
        }
        return pending.size();
    }

    @Transactional
    public OutboxEvent requeue(UUID id) {
        Access.requireRole("MANAGER");
        OutboxEvent e = crud.load(OutboxEvent.class, id);
        if (!"DEAD_LETTER".equals(e.status) && !"RETRY".equals(e.status)) throw ApiException.guard("INVALID_TRANSITION", "Only failed events can be requeued");
        e.status = "PENDING";
        e.attempts = 0;
        e.occurredAt = Instant.now();
        return crud.saveDomain(e, "REQUEUE", null, Map.of());
    }

    @Transactional(readOnly = true)
    public Map<String, Object> revealSecret(UUID id) {
        Access.requireRole("MANAGER");
        WebhookSubscription w = crud.load(WebhookSubscription.class, id);
        return Map.of("secret", delivery.secretFor(w), "signatureHeader", "X-Opes-Signature: sha256=HMAC_SHA256(secret, X-Opes-Timestamp + \".\" + body)");
    }

    private static ApiException bad(SensorAlert a) {
        return ApiException.guard("INVALID_TRANSITION", "Alert is " + a.status);
    }

    @Component
    public static class SensorHook implements ResourceHook {
        @Override
        public String path() { return "sensors"; }

        @Override
        public void beforeCreate(Object e) {
            ((Sensor) e).status = "OFFLINE";
        }
    }

    @Component
    public static class WebhookHook implements ResourceHook {
        private static final SecureRandom RANDOM = new SecureRandom();

        @Override
        public String path() { return "webhook-subscriptions"; }

        @Override
        public void beforeCreate(Object e) {
            WebhookSubscription w = (WebhookSubscription) e;
            if (!w.url.startsWith("https://")) throw ApiException.invalid("Webhook URLs must use https");
            w.secretHint = "Revealed to managers via :reveal-secret";
            if (w.status == null) w.status = "ACTIVE";
        }
    }
}
