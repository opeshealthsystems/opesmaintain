package com.opesware.maintain.identity.application;

import com.opesware.maintain.identity.domain.AppUser;
import com.opesware.maintain.identity.infrastructure.AppUserRepository;
import com.opesware.maintain.identity.infrastructure.DelegationRepository;
import com.opesware.maintain.identity.infrastructure.DeviceRepository;
import com.opesware.maintain.platform.application.Access;
import com.opesware.maintain.platform.application.ApiException;
import com.opesware.maintain.platform.application.AuditService;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.security.CurrentUser;
import com.opesware.maintain.workforce.domain.Technician;
import com.opesware.maintain.workforce.infrastructure.TechnicianRepository;
import com.opesware.maintain.workforce.infrastructure.TimeEntryRepository;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Subject access export and pseudonymisation (spec §11.3, plan item E3). Audit history stays intact. */
@Service
public class PersonalDataService {
    private final CrudService crud;
    private final AppUserRepository users;
    private final DeviceRepository devices;
    private final DelegationRepository delegations;
    private final TechnicianRepository technicians;
    private final TimeEntryRepository time;
    private final AuditService audit;
    private final EntityManager em;

    public PersonalDataService(CrudService crud, AppUserRepository users, DeviceRepository devices, DelegationRepository delegations,
                               TechnicianRepository technicians, TimeEntryRepository time, AuditService audit, EntityManager em) {
        this.crud = crud;
        this.users = users;
        this.devices = devices;
        this.delegations = delegations;
        this.technicians = technicians;
        this.time = time;
        this.audit = audit;
        this.em = em;
    }

    @Transactional
    public Map<String, Object> export(UUID userId) {
        Access.requireRole("ADMIN");
        AppUser u = crud.load(AppUser.class, userId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("exportedAt", Instant.now().toString());
        out.put("profile", crud.get("users", u.id));
        out.put("devices", crud.toMaps(crud.def("devices"), devices.findByUserId(u.id)));
        List<Object> dl = new ArrayList<>(delegations.findByDelegatorId(u.id));
        dl.addAll(delegations.findByDelegateId(u.id));
        out.put("delegations", crud.toMaps(crud.def("delegations"), dl));
        List<Technician> techs = technicians.findByUserId(u.id);
        out.put("technicianProfiles", crud.toMaps(crud.def("technicians"), techs));
        List<Object> entries = new ArrayList<>();
        for (Technician t : techs) entries.addAll(time.findByTechnicianId(t.id));
        out.put("timeEntries", crud.toMaps(crud.def("time-entries"), entries));
        out.put("notifications", crud.toMaps(crud.def("notifications"), em.createQuery(
                "select n from Notification n where n.tenantId = :t and n.recipient = :r", Object.class)
                .setParameter("t", u.tenantId).setParameter("r", u.email).getResultList()));
        out.put("auditEvents", crud.toMaps(crud.def("audit-events"), em.createQuery(
                "select a from AuditEvent a where a.tenantId = :t and a.actor = :n order by a.occurredAt", Object.class)
                .setParameter("t", u.tenantId).setParameter("n", u.fullName).setMaxResults(5000).getResultList()));
        audit.record("PERSONAL_DATA_EXPORTED", "User", u.id, Map.of("by", CurrentUser.actorName()));
        return out;
    }

    @Transactional
    public Map<String, Object> pseudonymise(UUID userId) {
        Access.requireRole("ADMIN");
        AppUser u = crud.load(AppUser.class, userId);
        if (!"OFFBOARDED".equals(u.status)) throw ApiException.guard("NOT_OFFBOARDED", "Offboard the user before pseudonymising their personal data");
        String alias = "Former user " + u.id.toString().substring(0, 8);
        u.fullName = alias;
        u.email = "erased-" + u.id + "@invalid";
        u.phone = null;
        u.jobTitle = null;
        u.mfaSecret = null;
        u.mfaEnrolledAt = null;
        u.passwordHash = null;
        u.tokensValidAfter = Instant.now();
        users.save(u);
        for (Technician t : technicians.findByUserId(u.id)) {
            t.fullName = alias;
            t.phone = null;
            em.merge(t);
        }
        audit.record("PERSONAL_DATA_PSEUDONYMISED", "User", u.id, Map.of("alias", alias));
        return Map.of("ok", true, "alias", alias);
    }
}
