package com.opesware.maintain.platform.notify;

import com.opesware.maintain.calibration.domain.CalibrationEvent;
import com.opesware.maintain.commercial.domain.Quote;
import com.opesware.maintain.identity.domain.AppUser;
import com.opesware.maintain.identity.infrastructure.AppUserRepository;
import com.opesware.maintain.integration.domain.OutboxEvent;
import com.opesware.maintain.integration.domain.SensorAlert;
import com.opesware.maintain.inventory.application.InventoryService;
import com.opesware.maintain.inventory.domain.Part;
import com.opesware.maintain.inventory.domain.StockMovement;
import com.opesware.maintain.maintenance.domain.MaintenanceRequest;
import com.opesware.maintain.maintenance.domain.WorkOrder;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.safety.domain.WorkPermit;
import com.opesware.maintain.workforce.domain.Assignment;
import com.opesware.maintain.workforce.domain.Technician;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Maps domain events from the outbox to the people who must act (plan item B1). Runs inside the
 * outbox dispatcher, so each event notifies at most once.
 */
@Component
public class NotificationRules {
    private final NotificationService notify;
    private final CrudService crud;
    private final AppUserRepository users;
    private final InventoryService inventory;

    public NotificationRules(NotificationService notify, CrudService crud, AppUserRepository users, InventoryService inventory) {
        this.notify = notify;
        this.crud = crud;
        this.users = users;
        this.inventory = inventory;
    }

    public void handle(OutboxEvent e) {
        UUID id;
        try {
            id = UUID.fromString(e.aggregateId);
        } catch (RuntimeException ex) {
            return;
        }
        switch (e.eventType) {
            case "AssignmentCreated.v1" -> {
                Assignment a = crud.load(Assignment.class, id);
                Technician t = crud.load(Technician.class, a.technicianId);
                WorkOrder w = crud.load(WorkOrder.class, a.workOrderId);
                if (t.userId != null) {
                    AppUser u = crud.load(AppUser.class, t.userId);
                    notify.notify(u.email, "ASSIGNMENT", "New assignment: " + w.number, w.title + " — scheduled " + a.scheduledStart, "/technician/" + w.id);
                }
            }
            case "MaintenanceRequestCreated.v1" -> {
                MaintenanceRequest r = crud.load(MaintenanceRequest.class, id);
                notify.notify("role:DISPATCHER", "REQUEST", "New " + r.priority.toLowerCase() + " request " + r.number, r.title, "/m/maintenance-requests/" + r.id);
            }
            case "WorkOrderTriaged.v1" -> {
                WorkOrder w = crud.load(WorkOrder.class, id);
                notify.notify("role:MANAGER", "APPROVAL", "Approval needed: " + w.number, w.title, "/m/work-orders/" + w.id);
            }
            case "WorkCompleted.v1" -> {
                WorkOrder w = crud.load(WorkOrder.class, id);
                notify.notify("role:MANAGER", "REVIEW", "Review needed: " + w.number, w.title + " was completed by " + w.completedBy, "/m/work-orders/" + w.id);
                if (w.customerId != null) {
                    for (AppUser u : customerUsers(w.customerId)) {
                        notify.notify(u.email, "SIGNOFF", "Work completed: " + w.number, w.title + " is ready for your sign-off.", "/portal");
                    }
                }
            }
            case "SlaBreached.v1" -> {
                WorkOrder w = crud.load(WorkOrder.class, id);
                notify.notify("role:MANAGER", "SLA", "SLA breached: " + w.number, w.title + " passed its contracted resolution time.", "/m/work-orders/" + w.id);
            }
            case "PermitVerified.v1" -> {
                WorkPermit p = crud.load(WorkPermit.class, id);
                notify.notify("role:SAFETY_OFFICER", "PERMIT", "Permit ready to issue: " + p.number, p.scope, "/m/work-permits/" + p.id);
            }
            case "QuoteUpdated.v1" -> {
                Quote q = crud.load(Quote.class, id);
                if ("SENT".equals(q.status)) {
                    for (AppUser u : customerUsers(q.customerId)) {
                        notify.notify(u.email, "QUOTE", "Quotation for your approval: " + q.number, q.title, "/m/quotes/" + q.id);
                    }
                }
            }
            case "StockMovementCreated.v1" -> {
                StockMovement m = crud.load(StockMovement.class, id);
                if (m.quantity.signum() >= 0) return;
                Part p = crud.load(Part.class, m.partId);
                inventory.enrich(List.of(p));
                if (p.reorderPoint != null && p.available.compareTo(p.reorderPoint) <= 0) {
                    notify.notify("role:STOREKEEPER", "LOW_STOCK", "Low stock: " + p.partNo, p.name + " — " + p.available.stripTrailingZeros().toPlainString() + " " + p.unit + " available (reorder point " + p.reorderPoint.stripTrailingZeros().toPlainString() + ")", "/m/parts/" + p.id);
                }
            }
            case "CalibrationUpdated.v1" -> {
                CalibrationEvent c = crud.load(CalibrationEvent.class, id);
                if (Boolean.TRUE.equals(c.investigationRequired) && "AS_FOUND".equals(c.status)) {
                    notify.notify("role:CALIBRATION_OFFICER", "CALIBRATION", "Out of tolerance: " + c.number, "Instrument restricted; evaluate work performed with it since its last calibration.", "/m/calibration-events/" + c.id);
                }
            }
            case "SensorAlertCreated.v1" -> {
                SensorAlert a = crud.load(SensorAlert.class, id);
                if ("ALARM".equals(a.severity)) notify.notify("role:PLANNER", "CONDITION", "Condition alarm", "Sensor reading " + a.value.stripTrailingZeros().toPlainString() + " breached " + a.threshold.stripTrailingZeros().toPlainString(), "/m/sensor-alerts/" + a.id);
            }
            default -> { }
        }
    }

    private List<AppUser> customerUsers(UUID customerId) {
        return users.findByCustomerId(customerId).stream().filter(u -> "CUSTOMER".equals(u.role) && "ACTIVE".equals(u.status)).toList();
    }
}
