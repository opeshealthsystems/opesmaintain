package com.opesware.maintain.reliability.api;

import com.opesware.maintain.platform.application.Access;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.security.CurrentUser;
import com.opesware.maintain.reliability.application.InsightService;
import com.opesware.maintain.reliability.application.KpiService;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class ReliabilityController {
    private final KpiService kpis;
    private final InsightService insights;
    private final CrudService crud;
    private final com.opesware.maintain.reliability.application.PredictiveService predictive;

    public ReliabilityController(KpiService kpis, InsightService insights, CrudService crud,
                                 com.opesware.maintain.reliability.application.PredictiveService predictive) {
        this.predictive = predictive;
        this.kpis = kpis;
        this.insights = insights;
        this.crud = crud;
    }

    @GetMapping("/kpis")
    public Map<String, Object> kpis(@RequestParam(defaultValue = "90") int days, @RequestParam(required = false) UUID siteId) {
        return kpis.kpis(Math.max(1, Math.min(days, 730)), siteId);
    }

    @GetMapping("/assets/{id}/reliability")
    public Map<String, Object> assetReliability(@PathVariable UUID id) {
        return predictive.reliability(id);
    }

    @PostMapping("/ai-insights:refresh")
    public Map<String, Object> refresh() {
        Access.requireRole("MANAGER", "PLANNER");
        return Map.of("created", insights.refresh(CurrentUser.requireTenant()));
    }

    @PostMapping("/ai-insights/{id}:accept")
    public Map<String, Object> accept(@PathVariable UUID id) {
        return crud.get("ai-insights", insights.review(id, true).id);
    }

    @PostMapping("/ai-insights/{id}:reject")
    public Map<String, Object> reject(@PathVariable UUID id) {
        return crud.get("ai-insights", insights.review(id, false).id);
    }
}
