package com.opesware.maintain.calibration.application;

import com.opesware.maintain.asset.domain.Asset;
import com.opesware.maintain.asset.domain.AssetEvent;
import com.opesware.maintain.calibration.domain.CalibrationEvent;
import com.opesware.maintain.calibration.domain.CalibrationPlan;
import com.opesware.maintain.platform.application.Access;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.application.ResourceHook;
import com.opesware.maintain.platform.security.CurrentUser;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Calibration workflow (spec §6.8): out-of-tolerance results restrict the instrument and open an investigation. */
@Service
public class CalibrationService {
    private final CrudService crud;

    public CalibrationService(CrudService crud) {
        this.crud = crud;
    }

    @Transactional
    public CalibrationEvent command(UUID id, String action, Map<String, Object> b) {
        Access.requireRole("CALIBRATION_OFFICER", "MANAGER");
        CalibrationEvent c = crud.load(CalibrationEvent.class, id);
        String from = c.status;
        switch (action) {
            case "record-as-found" -> {
                expect(c, "SCHEDULED");
                c.asFound = str(b, "asFound");
                c.asFoundInTolerance = bool(b, "inTolerance");
                c.performedOn = LocalDate.now();
                c.performedBy = CurrentUser.actorName();
                c.status = "AS_FOUND";
                if (!c.asFoundInTolerance) {
                    c.investigationRequired = true;
                    restrictAsset(c, "As-found result outside tolerance; evaluate affected past work");
                }
            }
            case "adjust" -> {
                expect(c, "AS_FOUND");
                c.status = "ADJUSTED";
            }
            case "record-as-left" -> {
                if (!"AS_FOUND".equals(from) && !"ADJUSTED".equals(from)) throw bad(c);
                c.asLeft = str(b, "asLeft");
                c.asLeftInTolerance = bool(b, "inTolerance");
                c.certificateNo = str(b, "certificateNo") != null ? str(b, "certificateNo") : c.certificateNo;
                c.status = "AS_LEFT";
            }
            case "review" -> {
                expect(c, "AS_LEFT");
                c.status = "REVIEWED";
            }
            case "approve" -> {
                expect(c, "REVIEWED");
                if (Objects.equals(c.performedBy, CurrentUser.actorName())) {
                    throw ApiException.guard("SEPARATION_OF_DUTIES", "The calibrating technician cannot approve their own result");
                }
                c.approvedBy = CurrentUser.actorName();
                c.status = "APPROVED";
                c.eligibility = Boolean.TRUE.equals(c.asLeftInTolerance) ? "ELIGIBLE" : "RESTRICTED";
                if ("RESTRICTED".equals(c.eligibility)) restrictAsset(c, "As-left result outside tolerance");
                if (c.planId != null) {
                    CalibrationPlan p = crud.load(CalibrationPlan.class, c.planId);
                    p.lastCalibratedOn = c.performedOn;
                    p.nextDueOn = c.performedOn.plusMonths(p.intervalMonths);
                    crud.saveDomain(p, "CALIBRATION_RECORDED", null, Map.of("nextDueOn", p.nextDueOn.toString()));
                }
            }
            case "reject" -> {
                if ("APPROVED".equals(from) || "REJECTED".equals(from)) throw bad(c);
                c.status = "REJECTED";
                c.eligibility = "RESTRICTED";
            }
            default -> throw ApiException.notFound("Action " + action);
        }
        return crud.saveDomain(c, action.toUpperCase(), "Calibration" + (action.equals("approve") ? "Approved" : "Updated") + ".v1",
                Map.of("from", from, "to", c.status));
    }

    private void restrictAsset(CalibrationEvent c, String reason) {
        Asset a = crud.load(Asset.class, c.assetId);
        String prior = a.safetyState;
        a.safetyState = "RESTRICTED";
        crud.saveDomain(a, "SAFETY_CHANGE", "AssetSafetyStateChanged.v1", Map.of("reason", reason));
        AssetEvent e = new AssetEvent();
        e.assetId = a.id;
        e.eventType = "SAFETY_CHANGED";
        e.fromValue = prior;
        e.toValue = "RESTRICTED";
        e.reason = reason + " (" + c.number + ")";
        e.effectiveAt = Instant.now();
        e.actor = CurrentUser.actorName();
        crud.persistNew(e);
    }

    private static String str(Map<String, Object> b, String k) {
        return b == null || b.get(k) == null ? null : b.get(k).toString();
    }

    private static boolean bool(Map<String, Object> b, String k) {
        if (b == null || b.get(k) == null) throw ApiException.invalid("Tolerance result (inTolerance) is required");
        return Boolean.parseBoolean(b.get(k).toString());
    }

    private static void expect(CalibrationEvent c, String s) {
        if (!s.equals(c.status)) throw bad(c);
    }

    private static ApiException bad(CalibrationEvent c) {
        return ApiException.guard("INVALID_TRANSITION", "Calibration is " + c.status);
    }

    @Component
    public static class EventHook implements ResourceHook {
        @Override
        public String path() { return "calibration-events"; }

        @Override
        public void beforeCreate(Object e) {
            CalibrationEvent c = (CalibrationEvent) e;
            c.status = "SCHEDULED";
            c.investigationRequired = false;
        }
    }

    @Component
    public static class PlanHook implements ResourceHook {
        @Override
        public String path() { return "calibration-plans"; }

        @Override
        public void beforeCreate(Object e) {
            CalibrationPlan p = (CalibrationPlan) e;
            if (p.status == null) p.status = "ACTIVE";
            if (p.nextDueOn == null) p.nextDueOn = LocalDate.now().plusMonths(p.intervalMonths);
        }
    }
}
