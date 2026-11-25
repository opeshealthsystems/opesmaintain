package com.opesware.maintain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.opesware.maintain.inventory.application.InventoryService;
import com.opesware.maintain.inventory.domain.Part;
import com.opesware.maintain.inventory.domain.Warehouse;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.domain.Tenant;
import com.opesware.maintain.platform.infrastructure.TenantRepo;
import com.opesware.maintain.platform.security.CurrentUser;
import com.opesware.maintain.platform.security.Principal;
import com.opesware.maintain.procurement.application.ProcurementService;
import com.opesware.maintain.procurement.domain.PurchaseOrder;
import com.opesware.maintain.procurement.domain.PurchaseRequisition;
import com.opesware.maintain.procurement.domain.Vendor;
import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/** Requisition → approval → purchase order → receipt, each step by the role that does it (found by the workflow test). */
@SpringBootTest
@ActiveProfiles("test")
class PurchasingWorkflowTest {
    @Autowired CrudService crud;
    @Autowired TenantRepo tenants;
    @Autowired ProcurementService procurement;
    @Autowired InventoryService inventory;

    UUID tenant;

    @AfterEach
    void clear() {
        CurrentUser.clear();
    }

    private void as(String role) {
        CurrentUser.set(new Principal(UUID.randomUUID(), tenant, role.toLowerCase() + "@pw.test", role + " user", role, null));
    }

    @Test
    void storekeeperRaisesProcurementOrdersStorekeeperReceives() {
        Tenant t = new Tenant();
        t.id = UUID.randomUUID(); t.code = "pw-" + t.id; t.legalName = "PW"; t.status = "ACTIVE";
        tenant = tenants.save(t).id;
        as("ADMIN");
        Part part = new Part(); part.partNo = "VB-1"; part.name = "V-belt"; part.unit = "PIECE";
        UUID partId = crud.persistNew(part).id;
        Warehouse w = new Warehouse(); w.code = "MAIN"; w.name = "Main store";
        UUID whId = crud.persistNew(w).id;
        Vendor v = new Vendor(); v.code = "V1"; v.name = "Douala Industrial Supplies"; v.approved = true;
        UUID vendorId = crud.persistNew(v).id;

        as("STOREKEEPER");
        PurchaseRequisition r = new PurchaseRequisition(); r.description = "V-belts"; r.quantity = new BigDecimal("4"); r.partId = partId;
        UUID reqId = crud.persistNew(r).id;
        assertThat(procurement.decide(reqId, "submit").status).isEqualTo("SUBMITTED");
        assertThatThrownBy(() -> procurement.decide(reqId, "approve")).isInstanceOf(ApiException.class); // cannot approve own request

        as("PROCUREMENT");
        assertThat(procurement.decide(reqId, "approve").status).isEqualTo("APPROVED");
        PurchaseOrder po = procurement.convert(reqId, vendorId);
        assertThat(po.warehouseId).isNull();
        procurement.order(po.id, "issue", Map.of());

        as("STOREKEEPER");
        PurchaseOrder received = procurement.order(po.id, "receive", Map.of("warehouseId", whId.toString()));
        assertThat(received.status).isEqualTo("RECEIVED");
        assertThat(received.warehouseId).isEqualTo(whId);
        assertThat(inventory.onHand(partId, whId)).isEqualByComparingTo("4");
    }
}
