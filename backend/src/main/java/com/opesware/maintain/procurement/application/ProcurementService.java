package com.opesware.maintain.procurement.application;

import com.opesware.maintain.inventory.application.InventoryService;
import com.opesware.maintain.platform.application.Access;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.Clock;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.application.ResourceHook;
import com.opesware.maintain.platform.security.CurrentUser;
import com.opesware.maintain.procurement.domain.PurchaseOrder;
import com.opesware.maintain.procurement.domain.PurchaseRequisition;
import com.opesware.maintain.procurement.domain.Vendor;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Requisition → purchase order → goods receipt into the stock ledger (OM-M21). */
@Service
public class ProcurementService {
    private final CrudService crud;
    private final InventoryService inventory;
    private final com.opesware.maintain.identity.application.DelegationService delegation;

    public ProcurementService(CrudService crud, InventoryService inventory, com.opesware.maintain.identity.application.DelegationService delegation) {
        this.delegation = delegation;
        this.crud = crud;
        this.inventory = inventory;
    }

    @Transactional
    public PurchaseOrder convert(UUID requisitionId, UUID vendorId) {
        Access.requireRole("PROCUREMENT", "MANAGER");
        PurchaseRequisition r = crud.load(PurchaseRequisition.class, requisitionId);
        if (!"APPROVED".equals(r.status)) throw ApiException.guard("NOT_APPROVED", "Only approved requisitions can be ordered");
        Vendor v = crud.load(Vendor.class, vendorId);
        if (!Boolean.TRUE.equals(v.approved)) throw ApiException.guard("VENDOR_NOT_APPROVED", v.name + " is not an approved vendor");
        PurchaseOrder po = new PurchaseOrder();
        po.vendorId = v.id;
        po.requisitionId = r.id;
        po.partId = r.partId;
        po.quantity = r.quantity;
        po.unitPrice = r.estimatedCost == null || r.quantity.signum() == 0 ? BigDecimal.ZERO
                : r.estimatedCost.divide(r.quantity, 2, RoundingMode.HALF_UP);
        po.orderDate = LocalDate.now();
        PurchaseOrder saved = crud.persistNew(po);
        r.status = "ORDERED";
        crud.saveDomain(r, "ORDER", "PurchaseRequested.v1", Map.of("po", saved.number));
        return saved;
    }

    @Transactional
    public PurchaseRequisition decide(UUID id, String action) {
        if ("approve".equals(action)) delegation.requireRoleOrDelegation("APPROVE_PURCHASES", "PROCUREMENT", "MANAGER");
        else Access.requireRole("PROCUREMENT", "MANAGER");
        PurchaseRequisition r = crud.load(PurchaseRequisition.class, id);
        String from = r.status;
        switch (action) {
            case "submit" -> { if (!"DRAFT".equals(from)) throw bad(from); r.status = "SUBMITTED"; }
            case "approve" -> {
                if (!"SUBMITTED".equals(from)) throw bad(from);
                if (CurrentUser.actorName().equals(r.requestedBy)) throw ApiException.guard("SEPARATION_OF_DUTIES", "Requesters cannot approve their own requisition");
                r.status = "APPROVED";
            }
            case "reject" -> { if (!"SUBMITTED".equals(from)) throw bad(from); r.status = "REJECTED"; }
            default -> throw ApiException.notFound("Action " + action);
        }
        return crud.saveDomain(r, action.toUpperCase(), "RequisitionUpdated.v1", Map.of("from", from, "to", r.status));
    }

    @Transactional
    public PurchaseOrder order(UUID id, String action, Map<String, Object> body) {
        PurchaseOrder po = crud.load(PurchaseOrder.class, id);
        String from = po.status;
        switch (action) {
            case "issue" -> {
                Access.requireRole("PROCUREMENT", "MANAGER");
                if (!"DRAFT".equals(from)) throw bad(from);
                po.status = "ISSUED";
            }
            case "cancel" -> {
                Access.requireRole("PROCUREMENT", "MANAGER");
                if (!"DRAFT".equals(from) && !"ISSUED".equals(from)) throw bad(from);
                po.status = "CANCELLED";
            }
            case "receive" -> {
                Access.requireRole("STOREKEEPER", "PROCUREMENT", "MANAGER");
                if (!"ISSUED".equals(from) && !"PARTIALLY_RECEIVED".equals(from)) throw bad(from);
                if (po.partId == null || po.warehouseId == null) throw ApiException.guard("RECEIPT_TARGET", "Part and receiving warehouse are required to receive");
                Object q = body == null ? null : body.get("quantity");
                BigDecimal qty = q == null ? po.quantity.subtract(Clock.nz(po.receivedQty)) : new BigDecimal(q.toString());
                if (qty.signum() <= 0 || Clock.nz(po.receivedQty).add(qty).compareTo(po.quantity) > 0) {
                    throw ApiException.guard("OVER_RECEIPT", "Receipt exceeds ordered quantity");
                }
                inventory.receive(po.partId, po.warehouseId, qty, po.unitPrice, po.number, "po:" + po.id + ":" + Clock.nz(po.receivedQty).toPlainString());
                po.receivedQty = Clock.nz(po.receivedQty).add(qty);
                po.status = po.receivedQty.compareTo(po.quantity) >= 0 ? "RECEIVED" : "PARTIALLY_RECEIVED";
            }
            default -> throw ApiException.notFound("Action " + action);
        }
        return crud.saveDomain(po, action.toUpperCase(), "PurchaseOrder" + Character.toUpperCase(action.charAt(0)) + action.substring(1) + "d.v1",
                Map.of("from", from, "to", po.status));
    }

    private static ApiException bad(String s) {
        return ApiException.guard("INVALID_TRANSITION", "Document is " + s);
    }

    @Component
    public static class PoHook implements ResourceHook {
        @Override
        public String path() { return "purchase-orders"; }

        @Override
        public void beforeCreate(Object e) {
            PurchaseOrder po = (PurchaseOrder) e;
            po.status = "DRAFT";
            po.receivedQty = BigDecimal.ZERO;
            if (po.orderDate == null) po.orderDate = LocalDate.now();
            total(po);
        }

        @Override
        public void beforeUpdate(Object e) {
            PurchaseOrder po = (PurchaseOrder) e;
            if (!"DRAFT".equals(po.status)) throw ApiException.guard("RECORD_LOCKED", "Only draft purchase orders can be edited");
            total(po);
        }

        private void total(PurchaseOrder po) {
            po.total = Clock.nz(po.quantity).multiply(Clock.nz(po.unitPrice)).setScale(2, RoundingMode.HALF_UP);
        }
    }

    @Component
    public static class RequisitionHook implements ResourceHook {
        @Override
        public String path() { return "purchase-requisitions"; }

        @Override
        public void beforeCreate(Object e) {
            PurchaseRequisition r = (PurchaseRequisition) e;
            r.status = r.status == null ? "DRAFT" : r.status;
            if (r.requestedBy == null) r.requestedBy = CurrentUser.actorName();
        }
    }
}
