package com.opesware.maintain.inventory.application;

import com.opesware.maintain.inventory.domain.CycleCount;
import com.opesware.maintain.inventory.domain.Part;
import com.opesware.maintain.inventory.domain.StockMovement;
import com.opesware.maintain.inventory.domain.StockReservation;
import com.opesware.maintain.inventory.domain.Warehouse;
import com.opesware.maintain.maintenance.domain.WorkOrder;
import com.opesware.maintain.platform.application.Access;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.Clock;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.application.ResourceHook;
import com.opesware.maintain.platform.security.CurrentUser;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Stock ledger (spec §6.5): on_hand = Σ signed movements, reserved = Σ open reservations,
 * available = on_hand − reserved. Mutations lock the part row and are idempotent by client operation id.
 */
@Service
public class InventoryService implements ResourceHook {
    private static final Set<String> STOCK_ROLES = Set.of("STOREKEEPER", "MANAGER", "TECHNICIAN", "PLANNER");
    private final CrudService crud;
    private final EntityManager em;

    public InventoryService(CrudService crud, EntityManager em) {
        this.crud = crud;
        this.em = em;
    }

    @Override
    public String path() {
        return "parts";
    }

    @Override
    public void enrich(List<?> entities) {
        if (entities.isEmpty()) return;
        List<UUID> ids = new ArrayList<>();
        for (Object o : entities) ids.add(((Part) o).id);
        Map<UUID, BigDecimal> onHand = sumBy("select m.partId, sum(m.quantity) from StockMovement m, Warehouse w "
                + "where w.id = m.warehouseId and w.kind <> 'QUARANTINE' and m.partId in :ids group by m.partId", ids);
        Map<UUID, BigDecimal> reserved = sumBy("select r.partId, sum(r.quantity - coalesce(r.issuedQty, 0)) from StockReservation r "
                + "where r.status = 'OPEN' and r.partId in :ids group by r.partId", ids);
        for (Object o : entities) {
            Part p = (Part) o;
            p.onHand = Clock.nz(onHand.get(p.id));
            p.reserved = Clock.nz(reserved.get(p.id));
            p.available = p.onHand.subtract(p.reserved);
        }
    }

    private Map<UUID, BigDecimal> sumBy(String jpql, List<UUID> ids) {
        Map<UUID, BigDecimal> m = new HashMap<>();
        for (Object[] row : em.createQuery(jpql, Object[].class).setParameter("ids", ids).getResultList()) {
            m.put((UUID) row[0], (BigDecimal) row[1]);
        }
        return m;
    }

    // ---------------------------------------------------------------- queries

    public BigDecimal onHand(UUID partId, UUID warehouseId) {
        BigDecimal v = em.createQuery("select sum(m.quantity) from StockMovement m where m.partId = :p and m.warehouseId = :w", BigDecimal.class)
                .setParameter("p", partId).setParameter("w", warehouseId).getSingleResult();
        return Clock.nz(v);
    }

    public BigDecimal reserved(UUID partId, UUID warehouseId) {
        BigDecimal v = em.createQuery("select sum(r.quantity - coalesce(r.issuedQty, 0)) from StockReservation r "
                        + "where r.partId = :p and r.warehouseId = :w and r.status = 'OPEN'", BigDecimal.class)
                .setParameter("p", partId).setParameter("w", warehouseId).getSingleResult();
        return Clock.nz(v);
    }

    public long openReservationCount(UUID workOrderId) {
        return em.createQuery("select count(r) from StockReservation r where r.workOrderId = :w and r.status = 'OPEN'", Long.class)
                .setParameter("w", workOrderId).getSingleResult();
    }

    public BigDecimal issuedCost(UUID workOrderId) {
        BigDecimal v = em.createQuery("select sum(-m.quantity * coalesce(m.unitCost, 0)) from StockMovement m "
                        + "where m.workOrderId = :w and m.movementType in ('ISSUE', 'RETURN')", BigDecimal.class)
                .setParameter("w", workOrderId).getSingleResult();
        return Clock.nz(v);
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> stockByWarehouse(UUID partId) {
        Part part = crud.load(Part.class, partId);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Warehouse w : em.createQuery("select w from Warehouse w where w.tenantId = :t order by w.name", Warehouse.class)
                .setParameter("t", CurrentUser.requireTenant()).getResultList()) {
            BigDecimal oh = onHand(part.id, w.id);
            BigDecimal rs = reserved(part.id, w.id);
            if (oh.signum() == 0 && rs.signum() == 0) continue;
            out.add(row(w, part, oh, rs));
        }
        return out;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> warehouseStock(UUID warehouseId) {
        Warehouse w = crud.load(Warehouse.class, warehouseId);
        List<Map<String, Object>> out = new ArrayList<>();
        List<Object[]> rows = em.createQuery("select m.partId, sum(m.quantity) from StockMovement m where m.warehouseId = :w group by m.partId", Object[].class)
                .setParameter("w", w.id).getResultList();
        for (Object[] r : rows) {
            Part p = em.find(Part.class, r[0]);
            out.add(row(w, p, (BigDecimal) r[1], reserved(p.id, w.id)));
        }
        out.sort((a, b) -> a.get("partName").toString().compareTo(b.get("partName").toString()));
        return out;
    }

    private Map<String, Object> row(Warehouse w, Part p, BigDecimal oh, BigDecimal rs) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("warehouseId", w.id.toString());
        m.put("warehouseName", w.name);
        m.put("partId", p.id.toString());
        m.put("partNo", p.partNo);
        m.put("partName", p.name);
        m.put("unit", p.unit);
        m.put("onHand", oh);
        m.put("reserved", rs);
        m.put("available", oh.subtract(rs));
        m.put("unitCost", p.unitCost);
        m.put("value", oh.multiply(Clock.nz(p.unitCost)));
        m.put("reorderPoint", p.reorderPoint);
        return m;
    }

    // ---------------------------------------------------------------- commands

    @Transactional
    public StockMovement receive(UUID partId, UUID warehouseId, BigDecimal qty, BigDecimal unitCost, String reference, String opId) {
        Access.requireRole("STOREKEEPER", "MANAGER", "PROCUREMENT");
        StockMovement prior = byOp(opId);
        if (prior != null) return prior;
        positive(qty);
        Part part = lockPart(partId);
        crud.load(Warehouse.class, warehouseId);
        return move(part, warehouseId, "RECEIPT", qty, unitCost == null ? part.unitCost : unitCost, null, null, reference, opId, null);
    }

    @Transactional
    public StockReservation reserve(UUID partId, UUID warehouseId, UUID workOrderId, BigDecimal qty, String opId) {
        requireStockRole();
        if (opId != null) {
            List<StockReservation> prior = em.createQuery("select r from StockReservation r where r.tenantId = :t and r.clientOperationId = :o", StockReservation.class)
                    .setParameter("t", CurrentUser.requireTenant()).setParameter("o", opId).getResultList();
            if (!prior.isEmpty()) return prior.getFirst();
        }
        positive(qty);
        Part part = lockPart(partId);
        crud.load(Warehouse.class, warehouseId);
        WorkOrder wo = crud.load(WorkOrder.class, workOrderId);
        if (Set.of("CLOSED", "CANCELLED").contains(wo.status)) throw ApiException.guard("WORK_ORDER_CLOSED", "Cannot reserve for a closed or cancelled work order");
        BigDecimal available = onHand(partId, warehouseId).subtract(reserved(partId, warehouseId));
        if (available.compareTo(qty) < 0) {
            throw ApiException.guard("INSUFFICIENT_STOCK", "Only " + available.stripTrailingZeros().toPlainString() + " " + part.unit + " available for " + part.partNo);
        }
        StockReservation r = new StockReservation();
        r.partId = partId;
        r.warehouseId = warehouseId;
        r.workOrderId = workOrderId;
        r.quantity = qty;
        r.issuedQty = BigDecimal.ZERO;
        r.status = "OPEN";
        r.clientOperationId = opId;
        return crud.persistNew(r);
    }

    @Transactional
    public StockMovement issue(UUID reservationId, BigDecimal qty, String opId) {
        requireStockRole();
        StockMovement prior = byOp(opId);
        if (prior != null) return prior;
        StockReservation r = crud.load(StockReservation.class, reservationId);
        Part part = lockPart(r.partId);
        em.flush();
        em.refresh(r, LockModeType.PESSIMISTIC_WRITE);
        if (!"OPEN".equals(r.status)) throw ApiException.guard("RESERVATION_CLOSED", "Reservation is " + r.status);
        BigDecimal remaining = r.quantity.subtract(Clock.nz(r.issuedQty));
        BigDecimal q = qty == null ? remaining : qty;
        positive(q);
        if (q.compareTo(remaining) > 0) throw ApiException.guard("OVER_ISSUE", "Cannot issue more than the reserved remainder " + remaining.toPlainString());
        if (onHand(r.partId, r.warehouseId).compareTo(q) < 0) throw ApiException.guard("INSUFFICIENT_STOCK", "Insufficient physical stock");
        r.issuedQty = Clock.nz(r.issuedQty).add(q);
        if (r.issuedQty.compareTo(r.quantity) >= 0) r.status = "ISSUED";
        crud.saveDomain(r, "ISSUE", "PartIssued.v1", Map.of("qty", q.toPlainString()));
        return move(part, r.warehouseId, "ISSUE", q.negate(), part.unitCost, r.workOrderId, r.id, "Issue to work order", opId, null);
    }

    @Transactional
    public StockReservation release(UUID reservationId) {
        requireStockRole();
        StockReservation r = crud.load(StockReservation.class, reservationId);
        if (!"OPEN".equals(r.status)) throw ApiException.guard("RESERVATION_CLOSED", "Reservation is " + r.status);
        r.status = "RELEASED";
        return crud.saveDomain(r, "RELEASE", "PartReservationReleased.v1", Map.of());
    }

    @Transactional
    public void releaseAllForWorkOrder(UUID workOrderId) {
        for (StockReservation r : em.createQuery("select r from StockReservation r where r.workOrderId = :w and r.status = 'OPEN'", StockReservation.class)
                .setParameter("w", workOrderId).getResultList()) {
            r.status = "RELEASED";
            crud.saveDomain(r, "RELEASE", "PartReservationReleased.v1", Map.of("reason", "work order cancelled"));
        }
    }

    @Transactional
    public StockMovement returnToStock(UUID partId, UUID warehouseId, UUID workOrderId, BigDecimal qty, String reason, String opId) {
        requireStockRole();
        StockMovement prior = byOp(opId);
        if (prior != null) return prior;
        positive(qty);
        Part part = lockPart(partId);
        if (workOrderId != null) {
            BigDecimal issued = Clock.nz(em.createQuery("select sum(-m.quantity) from StockMovement m where m.workOrderId = :w and m.partId = :p and m.movementType in ('ISSUE','RETURN')", BigDecimal.class)
                    .setParameter("w", workOrderId).setParameter("p", partId).getSingleResult());
            if (qty.compareTo(issued) > 0) throw ApiException.guard("OVER_RETURN", "Cannot return more than was issued to the work order (" + issued.toPlainString() + ")");
        }
        return move(part, warehouseId, "RETURN", qty, part.unitCost, workOrderId, null, "Return from work", opId, reason);
    }

    @Transactional
    public StockMovement adjust(UUID partId, UUID warehouseId, BigDecimal delta, String reason, String opId) {
        Access.requireRole("STOREKEEPER", "MANAGER");
        StockMovement prior = byOp(opId);
        if (prior != null) return prior;
        if (delta == null || delta.signum() == 0) throw ApiException.invalid("Adjustment quantity must be non-zero");
        if (reason == null || reason.isBlank()) throw ApiException.guard("REASON_REQUIRED", "An adjustment reason is required");
        Part part = lockPart(partId);
        if (onHand(partId, warehouseId).add(delta).signum() < 0) throw ApiException.guard("NEGATIVE_STOCK", "Adjustment would make stock negative");
        return move(part, warehouseId, "ADJUSTMENT", delta, part.unitCost, null, null, "Stock adjustment", opId, reason);
    }

    @Transactional
    public List<StockMovement> transfer(UUID partId, UUID fromWh, UUID toWh, BigDecimal qty, String opId) {
        Access.requireRole("STOREKEEPER", "MANAGER");
        positive(qty);
        if (fromWh.equals(toWh)) throw ApiException.invalid("Source and destination must differ");
        Part part = lockPart(partId);
        crud.load(Warehouse.class, toWh);
        BigDecimal available = onHand(partId, fromWh).subtract(reserved(partId, fromWh));
        if (available.compareTo(qty) < 0) throw ApiException.guard("INSUFFICIENT_STOCK", "Only " + available.toPlainString() + " available to transfer");
        StockMovement out = move(part, fromWh, "TRANSFER_OUT", qty.negate(), part.unitCost, null, null, "Transfer", opId == null ? null : opId + ":out", null);
        StockMovement in = move(part, toWh, "TRANSFER_IN", qty, part.unitCost, null, null, "Transfer", opId == null ? null : opId + ":in", null);
        return List.of(out, in);
    }

    @Transactional
    public CycleCount postCycleCount(UUID id) {
        Access.requireRole("STOREKEEPER", "MANAGER");
        CycleCount c = crud.load(CycleCount.class, id);
        if ("POSTED".equals(c.status)) throw ApiException.guard("ALREADY_POSTED", "Cycle count already posted");
        BigDecimal system = onHand(c.partId, c.warehouseId);
        c.systemQty = system;
        c.variance = c.countedQty.subtract(system);
        if (c.variance.signum() != 0) {
            Part part = lockPart(c.partId);
            move(part, c.warehouseId, "ADJUSTMENT", c.variance, part.unitCost, null, null, "Cycle count", "cc:" + c.id, "Cycle count variance");
        }
        c.status = "POSTED";
        return crud.saveDomain(c, "POST", "CycleCountPosted.v1", Map.of("variance", c.variance.toPlainString()));
    }

    // ---------------------------------------------------------------- helpers

    private StockMovement move(Part part, UUID warehouseId, String type, BigDecimal qty, BigDecimal unitCost, UUID woId,
                               UUID reservationId, String reference, String opId, String reason) {
        StockMovement m = new StockMovement();
        m.partId = part.id;
        m.warehouseId = warehouseId;
        m.movementType = type;
        m.quantity = qty;
        m.unitCost = unitCost;
        m.workOrderId = woId;
        m.reservationId = reservationId;
        m.reference = reference;
        m.clientOperationId = opId;
        m.reason = reason;
        m.occurredAt = Instant.now();
        m.actor = CurrentUser.actorName();
        return crud.persistNew(m);
    }

    private StockMovement byOp(String opId) {
        if (opId == null || opId.isBlank()) return null;
        List<StockMovement> l = em.createQuery("select m from StockMovement m where m.tenantId = :t and m.clientOperationId = :o", StockMovement.class)
                .setParameter("t", CurrentUser.requireTenant()).setParameter("o", opId).getResultList();
        return l.isEmpty() ? null : l.getFirst();
    }

    private Part lockPart(UUID partId) {
        crud.load(Part.class, partId);
        return em.find(Part.class, partId, LockModeType.PESSIMISTIC_WRITE);
    }

    private static void positive(BigDecimal q) {
        if (q == null || q.signum() <= 0) throw ApiException.invalid("Quantity must be greater than zero");
    }

    private static void requireStockRole() {
        var p = CurrentUser.require();
        if (!p.is("ADMIN") && !STOCK_ROLES.contains(p.role())) throw ApiException.forbidden("Role " + p.role() + " cannot move stock");
    }
}
