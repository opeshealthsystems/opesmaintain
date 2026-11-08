package com.opesware.maintain.reliability.application;

import com.opesware.maintain.asset.domain.Asset;
import com.opesware.maintain.asset.domain.Meter;
import com.opesware.maintain.asset.domain.MeterReading;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.reliability.domain.DowntimeEvent;
import jakarta.persistence.EntityManager;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Explainable statistics for maintenance intelligence (plan workstream G). Every result states its
 * method, sample size and inputs; nothing acts without human review.
 */
@Service
public class PredictiveService {
    static final int MIN_READINGS = 8;
    static final int MIN_FAILURES = 3;
    static final double Z_LIMIT = 3.0;
    private final EntityManager em;
    private final CrudService crud;

    public PredictiveService(EntityManager em, CrudService crud) {
        this.em = em;
        this.crud = crud;
    }

    public record Anomaly(Meter meter, double latest, double mean, double sd, double z, int n, String basis) {}

    public record Forecast(int failures, double mtbfDays, Instant lastFailure, Instant predictedNext, double confidence) {}

    /** Latest reading (instantaneous) or latest daily rate (cumulative) beyond 3σ of its own history. */
    public List<Anomaly> meterAnomalies(UUID tenant) {
        List<Anomaly> out = new ArrayList<>();
        for (Meter m : em.createQuery("select m from Meter m where m.tenantId = :t and m.status = 'ACTIVE'", Meter.class).setParameter("t", tenant).getResultList()) {
            List<MeterReading> rs = em.createQuery("select r from MeterReading r where r.meterId = :m and r.accepted = true order by r.readingAt", MeterReading.class)
                    .setParameter("m", m.id).getResultList();
            double[] series;
            String basis;
            if ("CUMULATIVE".equals(m.meterType)) {
                List<Double> rates = new ArrayList<>();
                for (int i = 1; i < rs.size(); i++) {
                    double days = Duration.between(rs.get(i - 1).readingAt, rs.get(i).readingAt).toMinutes() / 1440.0;
                    if (days > 0.01) rates.add(rs.get(i).value.subtract(rs.get(i - 1).value).doubleValue() / days);
                }
                series = rates.stream().mapToDouble(Double::doubleValue).toArray();
                basis = "usage rate per day";
            } else {
                series = rs.stream().mapToDouble(r -> r.value.doubleValue()).toArray();
                basis = "reading";
            }
            Anomaly a = zScore(m, series, basis);
            if (a != null) out.add(a);
        }
        return out;
    }

    static Anomaly zScore(Meter m, double[] series, String basis) {
        if (series.length < MIN_READINGS) return null;
        int n = series.length - 1;
        double mean = 0;
        for (int i = 0; i < n; i++) mean += series[i];
        mean /= n;
        double var = 0;
        for (int i = 0; i < n; i++) var += Math.pow(series[i] - mean, 2);
        double sd = Math.sqrt(var / (n - 1));
        if (sd < 1e-9) return null;
        double latest = series[n];
        double z = (latest - mean) / sd;
        return Math.abs(z) >= Z_LIMIT ? new Anomaly(m, latest, mean, sd, z, n, basis) : null;
    }

    /** Mean time between unplanned failures and the next expected failure, from the asset's own history. */
    @Transactional(readOnly = true)
    public Forecast forecast(UUID assetId) {
        List<Instant> starts = em.createQuery("select d.startedAt from DowntimeEvent d where d.assetId = :a and d.downtimeType = 'UNPLANNED' order by d.startedAt", Instant.class)
                .setParameter("a", assetId).getResultList();
        return forecastFrom(starts);
    }

    static Forecast forecastFrom(List<Instant> starts) {
        if (starts.size() < MIN_FAILURES) return new Forecast(starts.size(), Double.NaN, starts.isEmpty() ? null : starts.getLast(), null, 0);
        double total = Duration.between(starts.getFirst(), starts.getLast()).toMinutes() / 1440.0;
        double mtbf = total / (starts.size() - 1);
        Instant next = starts.getLast().plus(Duration.ofMinutes(Math.round(mtbf * 1440)));
        double confidence = Math.min(0.9, 0.4 + 0.1 * starts.size());
        return new Forecast(starts.size(), mtbf, starts.getLast(), next, confidence);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> reliability(UUID assetId) {
        Asset a = crud.load(Asset.class, assetId);
        Forecast f = forecast(a.id);
        double downHours = 0;
        for (DowntimeEvent d : em.createQuery("select d from DowntimeEvent d where d.assetId = :a", DowntimeEvent.class).setParameter("a", a.id).getResultList()) {
            Instant end = d.endedAt == null ? Instant.now() : d.endedAt;
            downHours += Duration.between(d.startedAt, end).toMinutes() / 60.0;
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("unplannedFailures", f.failures());
        m.put("mtbfDays", Double.isNaN(f.mtbfDays()) ? null : Math.round(f.mtbfDays() * 10) / 10.0);
        m.put("lastFailure", f.lastFailure() == null ? null : f.lastFailure().toString());
        m.put("predictedNextFailure", f.predictedNext() == null ? null : f.predictedNext().toString());
        m.put("confidence", f.confidence());
        m.put("totalDowntimeHours", Math.round(downHours * 10) / 10.0);
        m.put("method", "Mean interval between unplanned failures (minimum " + MIN_FAILURES + " failures); next = last failure + MTBF");
        return m;
    }
}
