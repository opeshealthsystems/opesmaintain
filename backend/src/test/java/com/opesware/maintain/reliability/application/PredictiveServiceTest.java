package com.opesware.maintain.reliability.application;

import static org.assertj.core.api.Assertions.assertThat;

import com.opesware.maintain.asset.domain.Meter;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class PredictiveServiceTest {
    @Test
    void flagsOnlyReadingsBeyondThreeSigma() {
        Meter m = new Meter();
        m.name = "Temp";
        double[] normal = {6.8, 7.1, 7.0, 6.9, 7.2, 7.0, 6.9, 7.1, 7.0};
        assertThat(PredictiveService.zScore(m, normal, "reading")).isNull();
        double[] spike = {6.8, 7.1, 7.0, 6.9, 7.2, 7.0, 6.9, 7.1, 11.5};
        PredictiveService.Anomaly a = PredictiveService.zScore(m, spike, "reading");
        assertThat(a).isNotNull();
        assertThat(a.z()).isGreaterThan(3);
        assertThat(a.n()).isEqualTo(8);
        assertThat(PredictiveService.zScore(m, new double[]{1, 2, 50}, "reading")).isNull(); // too few samples
    }

    @Test
    void forecastsNextFailureFromMeanInterval() {
        Instant t0 = Instant.parse("2026-01-01T00:00:00Z");
        List<Instant> starts = List.of(t0, t0.plusSeconds(10 * 86400), t0.plusSeconds(20 * 86400), t0.plusSeconds(30 * 86400));
        PredictiveService.Forecast f = PredictiveService.forecastFrom(starts);
        assertThat(f.mtbfDays()).isEqualTo(10.0);
        assertThat(f.predictedNext()).isEqualTo(t0.plusSeconds(40 * 86400));
        assertThat(PredictiveService.forecastFrom(List.of(t0, t0.plusSeconds(86400))).predictedNext()).isNull();
    }
}
