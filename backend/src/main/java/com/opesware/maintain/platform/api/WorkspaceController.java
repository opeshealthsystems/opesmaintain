package com.opesware.maintain.platform.api;

import com.opesware.maintain.maintenance.domain.WorkOrder;
import com.opesware.maintain.platform.application.Access;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.domain.Notification;
import com.opesware.maintain.platform.security.CurrentUser;
import com.opesware.maintain.platform.security.Principal;
import com.opesware.maintain.workforce.domain.Technician;
import jakarta.persistence.EntityManager;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Cross-cutting workspace endpoints: global search, notifications, technician queue, portal summary. */
@RestController
@RequestMapping("/api/v1")
public class WorkspaceController {
    private static final List<String> SEARCHABLE = List.of("work-orders", "assets", "maintenance-requests", "parts", "pm-plans",
            "customers", "work-permits", "vendors", "purchase-orders", "documents", "locations", "technicians");
    private final CrudService crud;
    private final EntityManager em;

    public WorkspaceController(CrudService crud, EntityManager em) {
        this.crud = crud;
        this.em = em;
    }

    @GetMapping("/search")
    public List<Map<String, Object>> search(@RequestParam String q) {
        Principal p = CurrentUser.require();
        List<Map<String, Object>> out = new ArrayList<>();
        if (q == null || q.trim().length() < 2) return out;
        for (String path : SEARCHABLE) {
            if (p.is("CUSTOMER") && !Access.CUSTOMER_READABLE.contains(path)) continue;
            Map<String, String> params = new HashMap<>();
            params.put("q", q.trim());
            params.put("size", "5");
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> items = (List<Map<String, Object>>) crud.list(path, params).get("items");
            for (Map<String, Object> i : items) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("resource", path);
                m.put("resourceLabel", crud.def(path).singular());
                m.put("id", i.get("id"));
                m.put("label", i.get("_label"));
                m.put("status", i.get("status"));
                out.add(m);
            }
        }
        return out;
    }

    @GetMapping("/notifications/mine")
    @Transactional(readOnly = true)
    public List<Notification> mine() {
        Principal p = CurrentUser.require();
        return em.createQuery("select n from Notification n where n.tenantId = :t and (n.recipient = :r or n.recipient = :role or n.recipient is null) order by n.createdAt desc", Notification.class)
                .setParameter("t", p.tenantId()).setParameter("r", p.email()).setParameter("role", "role:" + p.role())
                .setMaxResults(30).getResultList();
    }

    @PostMapping("/notifications/{id}:read")
    @Transactional
    public Map<String, Object> read(@PathVariable UUID id) {
        Notification n = crud.load(Notification.class, id);
        n.status = "READ";
        em.merge(n);
        return Map.of("ok", true);
    }

    /** Technician queue: work orders assigned to the technician profile linked to the current user. */
    @GetMapping("/technician/my-work")
    @Transactional(readOnly = true)
    public Map<String, Object> myWork() {
        Principal p = CurrentUser.require();
        if (p.is("CUSTOMER")) throw ApiException.forbidden("Not available");
        List<Technician> techs = em.createQuery("select t from Technician t where t.tenantId = :t and t.userId = :u", Technician.class)
                .setParameter("t", p.tenantId()).setParameter("u", p.userId()).getResultList();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("technician", techs.isEmpty() ? null : crud.get("technicians", techs.getFirst().id));
        List<Map<String, Object>> items = new ArrayList<>();
        if (!techs.isEmpty()) {
            List<WorkOrder> wos = em.createQuery("select w from WorkOrder w where w.tenantId = :t and w.assigneeId = :a order by w.dueAt", WorkOrder.class)
                    .setParameter("t", p.tenantId()).setParameter("a", techs.getFirst().id).getResultList();
            List<WorkOrder> active = wos.stream().filter(w -> Set.of("PLANNED", "DISPATCHED", "IN_PROGRESS", "ON_HOLD", "WORK_COMPLETED").contains(w.status)).toList();
            items = crud.toMaps(crud.def("work-orders"), active);
        }
        out.put("items", items);
        return out;
    }

    @GetMapping("/portal/summary")
    @Transactional(readOnly = true)
    public Map<String, Object> portal() {
        Principal p = CurrentUser.require();
        Map<String, Object> out = new LinkedHashMap<>();
        UUID customer = p.customerId();
        if (customer == null && !p.internal()) throw ApiException.forbidden("No customer linked");
        String filter = customer == null ? "" : " and x.customerId = :c";
        out.put("assets", count("Asset", filter, p.tenantId(), customer));
        out.put("openRequests", count("MaintenanceRequest", filter + " and x.status in ('SUBMITTED','ACKNOWLEDGED','TRIAGED')", p.tenantId(), customer));
        out.put("activeWork", count("WorkOrder", filter + " and x.status not in ('CLOSED','CANCELLED')", p.tenantId(), customer));
        out.put("awaitingSignoff", count("WorkOrder", filter + " and x.status in ('WORK_COMPLETED','REVIEWED')", p.tenantId(), customer));
        out.put("pendingQuotes", count("Quote", filter + " and x.status = 'SENT'", p.tenantId(), customer));
        out.put("activeContracts", count("ServiceContract", filter + " and x.status = 'ACTIVE'", p.tenantId(), customer));
        return out;
    }

    private long count(String entity, String filter, UUID tenant, UUID customer) {
        var q = em.createQuery("select count(x) from " + entity + " x where x.tenantId = :t" + filter, Long.class).setParameter("t", tenant);
        if (customer != null && filter.contains(":c")) q.setParameter("c", customer);
        return q.getSingleResult();
    }
}
