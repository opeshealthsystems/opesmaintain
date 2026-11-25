package com.opesware.maintain.platform.security;

import com.opesware.maintain.asset.domain.Asset;
import com.opesware.maintain.identity.domain.AppUser;
import com.opesware.maintain.organization.application.OrganizationService;
import com.opesware.maintain.organization.domain.Organization;
import com.opesware.maintain.organization.domain.ServiceGrant;
import com.opesware.maintain.organization.domain.Site;
import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Builds the access scope of a service-provider user from the grants their organization holds.
 * Grants list sites by id, code or name, and assets by id or tag. ALL_SITES grants every site of
 * the tenant; no effective grant means no record access at all.
 */
@Component
public class ScopeResolver {
    private final EntityManager em;

    public ScopeResolver(EntityManager em) {
        this.em = em;
    }

    @org.springframework.beans.factory.annotation.Value("${opes.security.site-scoped-roles:TECHNICIAN}")
    private String siteScopedRoles = "TECHNICIAN";

    @Transactional(readOnly = true)
    public AccessScope resolve(AppUser user) {
        if ("ADMIN".equals(user.role)) return null;
        Organization org = user.organizationId == null ? null : em.find(Organization.class, user.organizationId);
        if (org == null || !"SERVICE_PROVIDER".equals(org.kind)) return homeSite(user);
        LocalDate today = LocalDate.now();
        List<ServiceGrant> grants = em.createQuery("select g from ServiceGrant g where g.tenantId = :t and g.providerOrgId = :o", ServiceGrant.class)
                .setParameter("t", user.tenantId).setParameter("o", org.id).getResultList().stream()
                .filter(g -> OrganizationService.isEffective(g, today)).toList();
        List<Site> sites = em.createQuery("select s from Site s where s.tenantId = :t", Site.class).setParameter("t", user.tenantId).getResultList();
        Set<UUID> siteIds = new HashSet<>();
        Set<UUID> assetIds = new HashSet<>();
        List<Asset> assets = em.createQuery("select a from Asset a where a.tenantId = :t", Asset.class).setParameter("t", user.tenantId).getResultList();
        for (ServiceGrant g : grants) {
            switch (g.scope) {
                case "ALL_SITES" -> sites.forEach(s -> siteIds.add(s.id));
                case "SELECTED_SITES" -> {
                    Set<String> wanted = tokens(g.siteIds);
                    for (Site s : sites) {
                        if (wanted.contains(s.id.toString()) || wanted.contains(lc(s.code)) || wanted.contains(lc(s.name))) siteIds.add(s.id);
                    }
                }
                case "SELECTED_ASSETS" -> {
                    Set<String> wanted = tokens(g.assetIds);
                    for (Asset a : assets) if (wanted.contains(a.id.toString()) || wanted.contains(lc(a.tag))) assetIds.add(a.id);
                }
                default -> { }
            }
        }
        for (Asset a : assets) if (a.siteId != null && siteIds.contains(a.siteId)) assetIds.add(a.id);
        return new AccessScope(Set.copyOf(siteIds), Set.copyOf(assetIds));
    }

    /** Internal staff in site-scoped roles (default: technicians) see only their home site. */
    private AccessScope homeSite(AppUser user) {
        if (user.siteId == null) return null;
        boolean scoped = Arrays.stream(siteScopedRoles.split(",")).map(String::trim).anyMatch(r -> r.equals(user.role));
        if (!scoped) return null;
        Set<UUID> assets = em.createQuery("select a.id from Asset a where a.tenantId = :t and a.siteId = :s", UUID.class)
                .setParameter("t", user.tenantId).setParameter("s", user.siteId).getResultList().stream().collect(Collectors.toSet());
        return new AccessScope(Set.of(user.siteId), Set.copyOf(assets));
    }

    private static Set<String> tokens(String text) {
        if (text == null) return Set.of();
        return Arrays.stream(text.split("[,;\\n]")).map(ScopeResolver::lc).filter(s -> !s.isEmpty()).collect(Collectors.toSet());
    }

    private static String lc(String s) {
        return s == null ? "" : s.trim().toLowerCase(Locale.ROOT);
    }
}
