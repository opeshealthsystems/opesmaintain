package com.opesware.maintain.platform.application;

import com.opesware.maintain.platform.domain.IdempotencyRecord;
import com.opesware.maintain.platform.domain.TenantEntity;
import com.opesware.maintain.platform.infrastructure.IdempotencyRepo;
import com.opesware.maintain.platform.infrastructure.TenantRepository;
import com.opesware.maintain.platform.security.CurrentUser;
import com.opesware.maintain.platform.security.Principal;
import jakarta.persistence.criteria.Predicate;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.beans.factory.ListableBeanFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.repository.support.Repositories;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Tenant-scoped persistence engine for catalogued resources. Every query is filtered by the
 * authenticated principal's tenant; ids from other tenants are indistinguishable from missing ids.
 * Guarded lifecycle fields are excluded and change only through domain command services.
 */
@Service
public class CrudService {
    private final Repositories repositories;
    private final AuditService audit;
    private final OutboxService outbox;
    private final NumberService numbers;
    private final IdempotencyRepo idempotency;
    private final org.springframework.beans.factory.ObjectProvider<ResourceHook> hookProvider;
    private volatile Map<String, List<ResourceHook>> hookMap;

    public CrudService(ListableBeanFactory beanFactory, AuditService audit, OutboxService outbox, NumberService numbers,
                       IdempotencyRepo idempotency, org.springframework.beans.factory.ObjectProvider<ResourceHook> hookProvider) {
        this.repositories = new Repositories(beanFactory);
        this.audit = audit;
        this.outbox = outbox;
        this.numbers = numbers;
        this.idempotency = idempotency;
        this.hookProvider = hookProvider;
    }

    private List<ResourceHook> hooks(String path) {
        Map<String, List<ResourceHook>> m = hookMap;
        if (m == null) {
            m = new HashMap<>();
            for (ResourceHook h : hookProvider.orderedStream().toList()) m.computeIfAbsent(h.path(), k -> new ArrayList<>()).add(h);
            hookMap = m;
        }
        return m.getOrDefault(path, List.of());
    }

    public ResourceDef def(String path) {
        ResourceDef d = ResourceCatalog.get(path);
        if (d == null) throw ApiException.notFound("Resource " + path);
        return d;
    }

    @SuppressWarnings("unchecked")
    public <T> TenantRepository<T> repo(Class<T> type) {
        return (TenantRepository<T>) repositories.getRepositoryFor(type)
                .orElseThrow(() -> new IllegalStateException("No repository for " + type));
    }

    @SuppressWarnings("unchecked")
    public TenantRepository<Object> repo(ResourceDef def) {
        return (TenantRepository<Object>) repo(def.entity());
    }

    // ------------------------------------------------------------------ reads

    @Transactional(readOnly = true)
    public Map<String, Object> list(String path, Map<String, String> params) {
        ResourceDef def = def(path);
        Principal p = Access.canRead(def);
        int page = Math.max(0, parseInt(params.get("page"), 0));
        int size = Math.min(5000, Math.max(1, parseInt(params.get("size"), 25)));
        Page<Object> result = repo(def).findAll(spec(def, p, params), PageRequest.of(page, size, sort(def, params.get("sort"))));
        List<Object> items = result.getContent();
        enrich(def, items);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", toMaps(def, items));
        out.put("total", result.getTotalElements());
        out.put("page", page);
        out.put("size", size);
        return out;
    }

    /** Lists entities (not maps) for internal callers such as reports; same authorization. */
    @Transactional(readOnly = true)
    public List<Object> findAll(String path, Map<String, String> params, int max) {
        ResourceDef def = def(path);
        Principal p = Access.canRead(def);
        List<Object> items = repo(def).findAll(spec(def, p, params), PageRequest.of(0, max, sort(def, params.get("sort")))).getContent();
        enrich(def, items);
        return items;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> get(String path, UUID id) {
        ResourceDef def = def(path);
        Object e = load(def, id);
        enrich(def, List.of(e));
        return toMaps(def, List.of(e)).getFirst();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> options(String path, String q, String filterField, String filterValue) {
        ResourceDef def = def(path);
        Principal p = Access.canRead(def);
        Map<String, String> params = new HashMap<>();
        if (q != null) params.put("q", q);
        if (filterField != null && filterValue != null) params.put(filterField, filterValue);
        List<Object> items = repo(def).findAll(spec(def, p, params), PageRequest.of(0, 50, Sort.by(Sort.Direction.ASC, def.display()))).getContent();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object e : items) out.add(Map.of("id", Fields.id(e).toString(), "label", label(def, e)));
        return out;
    }

    /** Loads an entity enforcing tenant and customer scope; missing and foreign ids both yield 404. */
    @Transactional(readOnly = true)
    public Object load(ResourceDef def, UUID id) {
        return load(def, id, Access.canRead(def));
    }

    private Object load(ResourceDef def, UUID id, Principal p) {
        Object e = repo(def).findById(id).orElse(null);
        if (e == null || !Objects.equals(((TenantEntity) e).tenantId, p.tenantId())) throw ApiException.notFound(def.singular());
        if (p.is("CUSTOMER") && def.has("customerId") && !Objects.equals(Fields.get(e, "customerId"), p.customerId())) {
            throw ApiException.notFound(def.singular());
        }
        if (CurrentUser.scope() != null) {
            Specification<Object> byId = (r, q, cb) -> cb.equal(r.get("id"), id);
            if (repo(def).count(spec(def, p, Map.of()).and(byId)) == 0) throw ApiException.notFound(def.singular());
        }
        return e;
    }

    @SuppressWarnings("unchecked")
    public <T> T load(Class<T> type, UUID id) {
        if (id == null) throw ApiException.invalid("Identifier required");
        // Loads made by commands and hooks keep tenant, customer and site scope but not the need-to-know reader list.
        ResourceDef def = ResourceCatalog.of(type);
        return (T) load(def, id, Access.canReadForCommand(def));
    }

    // ------------------------------------------------------------------ writes

    @Transactional
    public Map<String, Object> create(String path, Map<String, Object> body, String idemKey) {
        ResourceDef def = def(path);
        Principal p = Access.canWrite(def);
        if (idemKey != null && !idemKey.isBlank()) {
            var prior = idempotency.findByTenantIdAndScopeAndIdemKey(p.tenantId(), "create:" + path, idemKey);
            if (prior.isPresent()) return get(path, prior.get().resultId);
        }
        Object e = instantiate(def);
        applyBody(def, e, body, true);
        if (p.is("CUSTOMER") && def.has("customerId")) Fields.set(e, "customerId", p.customerId());
        Object saved = persistNew(def, e);
        if (idemKey != null && !idemKey.isBlank()) {
            IdempotencyRecord r = new IdempotencyRecord();
            r.id = UUID.randomUUID();
            r.tenantId = p.tenantId();
            r.scope = "create:" + path;
            r.idemKey = idemKey;
            r.resultId = Fields.id(saved);
            r.createdAt = Instant.now();
            idempotency.save(r);
        }
        return get(path, Fields.id(saved));
    }

    /** Persists a new entity built by domain code: numbering, validation, hooks, audit and outbox. */
    @Transactional
    public <T> T persistNew(ResourceDef def, T e) {
        if (def.prefix() != null && def.has("number") && Fields.get(e, "number") == null) {
            Fields.set(e, "number", numbers.next(def.prefix()));
        }
        for (ResourceHook h : hooks(def.path())) h.beforeCreate(e);
        validate(def, e);
        @SuppressWarnings("unchecked") T saved = (T) repo(def).save(e);
        for (ResourceHook h : hooks(def.path())) h.afterSave(saved, true);
        audit.record("CREATE", def.singular(), Fields.id(saved), Map.of("label", label(def, saved)));
        outbox.publish(def.entity().getSimpleName() + "Created.v1", def.entity().getSimpleName(), Fields.id(saved),
                Map.of("id", Fields.id(saved).toString()));
        return saved;
    }

    @Transactional
    public <T> T persistNew(T e) {
        return persistNew(ResourceCatalog.of(e.getClass()), e);
    }

    @Transactional
    public Map<String, Object> update(String path, UUID id, Map<String, Object> body, String ifMatch) {
        ResourceDef def = def(path);
        Access.canWrite(def);
        Object e = load(def, id);
        checkVersion(e, ifMatch, body);
        Map<String, Object> before = snapshot(def, e);
        applyBody(def, e, body, false);
        for (ResourceHook h : hooks(def.path())) h.beforeUpdate(e, before);
        validate(def, e);
        repo(def).save(e);
        for (ResourceHook h : hooks(def.path())) h.afterSave(e, false);
        Map<String, Object> changes = diff(before, snapshot(def, e));
        audit.record("UPDATE", def.singular(), id, changes);
        outbox.publish(def.entity().getSimpleName() + "Updated.v1", def.entity().getSimpleName(), id, Map.of("changed", changes.keySet()));
        return get(path, id);
    }

    /** Saves a domain-modified entity with audit + outbox in the same transaction. */
    @Transactional
    public <T> T saveDomain(T e, String action, String eventType, Map<String, ?> detail) {
        ResourceDef def = ResourceCatalog.of(e.getClass());
        validate(def, e);
        @SuppressWarnings("unchecked") T saved = (T) repo(def).save(e);
        for (ResourceHook h : hooks(def.path())) h.afterSave(saved, false);
        audit.record(action, def.singular(), Fields.id(saved), detail);
        if (eventType != null) outbox.publish(eventType, def.entity().getSimpleName(), Fields.id(saved), detail);
        return saved;
    }

    public static void checkVersion(Object e, String ifMatch, Map<String, Object> body) {
        String expected = ifMatch != null ? ifMatch.replace("\"", "").replace("W/", "")
                : body != null && body.get("version") != null ? body.get("version").toString() : null;
        if (expected == null) throw new ApiException(428, "PRECONDITION_REQUIRED", "If-Match header with the current version is required");
        Long current = ((TenantEntity) e).version;
        if (!String.valueOf(current).equals(expected.trim())) {
            throw new ApiException(412, "VERSION_MISMATCH", "This record was changed by someone else (current version " + current + "). Reload and retry.");
        }
    }

    // ------------------------------------------------------------------ helpers

    private Object instantiate(ResourceDef def) {
        try {
            return def.entity().getDeclaredConstructor().newInstance();
        } catch (ReflectiveOperationException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private void applyBody(ResourceDef def, Object e, Map<String, Object> body, boolean creating) {
        if (body == null) return;
        for (FieldDef f : def.fields()) {
            if (!body.containsKey(f.name())) continue;
            if (f.managed() || f.hidden() || f.computed()) continue;
            if (f.guarded() && !creating) continue;
            Fields.set(e, f.name(), Fields.convert(f, body.get(f.name())));
        }
    }

    private void validate(ResourceDef def, Object e) {
        List<Map<String, String>> errors = new ArrayList<>();
        UUID tenant = ((TenantEntity) e).tenantId != null ? ((TenantEntity) e).tenantId : CurrentUser.requireTenant();
        for (FieldDef f : def.fields()) {
            if (f.computed() || f.hidden()) continue;
            Object v = Fields.get(e, f.name());
            if (f.required() && (v == null || (v instanceof String s && s.isBlank()))) {
                errors.add(Map.of("field", f.name(), "message", f.label() + " is required"));
            }
            if (v != null && "enum".equals(f.type()) && !f.options().contains(v.toString())) {
                errors.add(Map.of("field", f.name(), "message", f.label() + " has an invalid value"));
            }
            if (v != null && f.ref() != null) {
                ResourceDef target = ResourceCatalog.get(f.ref());
                Object ref = repo(target).findById((UUID) v).orElse(null);
                if (ref == null || !Objects.equals(((TenantEntity) ref).tenantId, tenant)) {
                    errors.add(Map.of("field", f.name(), "message", f.label() + " does not exist"));
                } else {
                    Principal cp = CurrentUser.get();
                    if (cp != null && cp.is("CUSTOMER") && target.has("customerId")
                            && !Objects.equals(Fields.get(ref, "customerId"), cp.customerId())) {
                        errors.add(Map.of("field", f.name(), "message", f.label() + " does not exist"));
                    } else if (cp != null && CurrentUser.scope() != null) {
                        UUID refId = (UUID) v;
                        Specification<Object> byId = (r, q, cb) -> cb.equal(r.get("id"), refId);
                        if (repo(target).count(spec(target, cp, Map.of()).and(byId)) == 0) {
                            errors.add(Map.of("field", f.name(), "message", f.label() + " is outside your service grant"));
                        }
                    }
                }
            }
        }
        if (!errors.isEmpty()) throw new ApiException(400, "VALIDATION_FAILED", errors.getFirst().get("message"), errors);
    }

    private Specification<Object> spec(ResourceDef def, Principal p, Map<String, String> params) {
        return (root, query, cb) -> {
            List<Predicate> and = new ArrayList<>();
            and.add(cb.equal(root.get("tenantId"), p.tenantId()));
            if (p.is("CUSTOMER") && def.has("customerId")) and.add(cb.equal(root.get("customerId"), p.customerId()));
            com.opesware.maintain.platform.security.AccessScope scope = CurrentUser.scope();
            if (scope != null) and.add(scoped(def, root, query, cb, scope));
            String q = params.get("q");
            if (q != null && !q.isBlank()) {
                List<Predicate> or = new ArrayList<>();
                String like = "%" + q.toLowerCase().trim() + "%";
                for (FieldDef f : def.fields()) {
                    if (("str".equals(f.type()) || "enum".equals(f.type())) && !f.hidden() && !f.computed()) {
                        or.add(cb.like(cb.lower(root.get(f.name())), like));
                    }
                }
                if (!or.isEmpty()) and.add(cb.or(or.toArray(new Predicate[0])));
            }
            for (Map.Entry<String, String> en : params.entrySet()) {
                String key = en.getKey();
                String val = en.getValue();
                if (val == null || val.isBlank()) continue;
                String base = key.endsWith("From") || key.endsWith("To") ? key.replaceAll("(From|To)$", "") : key;
                FieldDef f = def.field(key);
                if (f != null && !f.hidden() && !f.computed()) {
                    if (val.contains(",") && !"text".equals(f.type())) {
                        List<Object> values = new ArrayList<>();
                        for (String v : val.split(",")) values.add(Fields.convert(f, v));
                        and.add(root.get(f.name()).in(values));
                    } else if ("null".equals(val)) {
                        and.add(cb.isNull(root.get(f.name())));
                    } else {
                        and.add(cb.equal(root.get(f.name()), Fields.convert(f, val)));
                    }
                } else if (!base.equals(key) && def.field(base) != null) {
                    FieldDef rf = def.field(base);
                    if ("date".equals(rf.type()) || "datetime".equals(rf.type())) {
                        Comparable<Object> c = cast(Fields.convert(rf, val));
                        and.add(key.endsWith("From") ? cb.greaterThanOrEqualTo(root.get(base), c) : cb.lessThanOrEqualTo(root.get(base), c));
                    }
                }
            }
            return cb.and(and.toArray(new Predicate[0]));
        };
    }

    /** Service-provider users see only records at granted sites or on granted assets. */
    private jakarta.persistence.criteria.Predicate scoped(ResourceDef def, jakarta.persistence.criteria.Root<Object> root,
                                                          jakarta.persistence.criteria.CriteriaQuery<?> query,
                                                          jakarta.persistence.criteria.CriteriaBuilder cb,
                                                          com.opesware.maintain.platform.security.AccessScope scope) {
        java.util.Set<UUID> none = java.util.Set.of(new UUID(0, 0));
        java.util.Collection<UUID> sites = scope.sites().isEmpty() ? none : scope.sites();
        java.util.Collection<UUID> assets = scope.assets().isEmpty() ? none : scope.assets();
        if ("assets".equals(def.path())) return root.get("id").in(assets);
        if ("sites".equals(def.path())) return root.get("id").in(sites);
        List<Predicate> or = new ArrayList<>();
        if (def.has("siteId")) or.add(root.get("siteId").in(sites));
        if (def.has("assetId")) or.add(root.get("assetId").in(assets));
        if (def.has("workOrderId")) {
            var sub = query.subquery(UUID.class);
            var w = sub.from(com.opesware.maintain.maintenance.domain.WorkOrder.class);
            sub.select(w.get("id")).where(cb.or(w.get("siteId").in(sites), w.get("assetId").in(assets)));
            or.add(root.get("workOrderId").in(sub));
        }
        if (def.has("meterId")) {
            var sub = query.subquery(UUID.class);
            var m = sub.from(com.opesware.maintain.asset.domain.Meter.class);
            sub.select(m.get("id")).where(m.get("assetId").in(assets));
            or.add(root.get("meterId").in(sub));
        }
        return or.isEmpty() ? cb.conjunction() : cb.or(or.toArray(new Predicate[0]));
    }

    @SuppressWarnings("unchecked")
    private static Comparable<Object> cast(Object o) {
        return (Comparable<Object>) o;
    }

    private Sort sort(ResourceDef def, String sort) {
        if (sort == null || sort.isBlank()) return Sort.by(Sort.Direction.DESC, "createdAt");
        String[] parts = sort.split(",");
        String field = parts[0];
        if (!def.has(field) && !Set.of("createdAt", "updatedAt").contains(field)) return Sort.by(Sort.Direction.DESC, "createdAt");
        if (def.has(field) && def.field(field).computed()) return Sort.by(Sort.Direction.DESC, "createdAt");
        Sort.Direction dir = parts.length > 1 && parts[1].equalsIgnoreCase("desc") ? Sort.Direction.DESC : Sort.Direction.ASC;
        return Sort.by(dir, field);
    }

    public void enrich(ResourceDef def, List<?> items) {
        for (ResourceHook h : hooks(def.path())) h.enrich(items);
    }

    public String label(ResourceDef def, Object e) {
        Object v = def.has(def.display()) ? Fields.get(e, def.display()) : null;
        String base = v == null ? "" : Fields.toJson(v).toString();
        if (def.has("number") && !"number".equals(def.display()) && Fields.get(e, "number") != null) {
            return Fields.get(e, "number") + " · " + base;
        }
        if (def.has("tag") && Fields.get(e, "tag") != null) return Fields.get(e, "tag") + " · " + base;
        return base.isEmpty() ? Fields.id(e).toString().substring(0, 8) : base;
    }

    public List<Map<String, Object>> toMaps(ResourceDef def, List<?> items) {
        Map<String, Map<UUID, String>> labels = new HashMap<>();
        for (FieldDef f : def.fields()) {
            if (f.ref() == null || f.hidden()) continue;
            Set<UUID> ids = new HashSet<>();
            for (Object e : items) {
                Object v = Fields.get(e, f.name());
                if (v != null) ids.add((UUID) v);
            }
            if (ids.isEmpty()) continue;
            ResourceDef target = ResourceCatalog.get(f.ref());
            Map<UUID, String> m = labels.computeIfAbsent(f.ref(), k -> new HashMap<>());
            ids.removeAll(m.keySet());
            if (!ids.isEmpty()) {
                for (Object r : repo(target).findAllById(ids)) m.put(Fields.id(r), label(target, r));
            }
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object e : items) {
            TenantEntity t = (TenantEntity) e;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", t.id.toString());
            m.put("version", t.version);
            m.put("createdAt", Fields.toJson(t.createdAt));
            m.put("updatedAt", Fields.toJson(t.updatedAt));
            m.put("createdBy", t.createdBy);
            m.put("_label", label(def, e));
            for (FieldDef f : def.fields()) {
                if (f.hidden()) continue;
                Object v = Fields.get(e, f.name());
                m.put(f.name(), Fields.toJson(v));
                if (f.ref() != null && v != null) {
                    m.put(f.name() + "Label", labels.getOrDefault(f.ref(), Map.of()).getOrDefault((UUID) v, "—"));
                }
            }
            out.add(m);
        }
        return out;
    }

    private Map<String, Object> snapshot(ResourceDef def, Object e) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (FieldDef f : def.fields()) if (!f.hidden() && !f.computed()) m.put(f.name(), Fields.toJson(Fields.get(e, f.name())));
        return m;
    }

    private static Map<String, Object> diff(Map<String, Object> a, Map<String, Object> b) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (String k : b.keySet()) {
            if (!Objects.equals(a.get(k), b.get(k))) out.put(k, Map.of("from", String.valueOf(a.get(k)), "to", String.valueOf(b.get(k))));
        }
        return out;
    }

    public static <K, V> Map<K, V> index(Collection<V> items, Function<V, K> key) {
        return items.stream().collect(Collectors.toMap(key, v -> v, (x, y) -> x));
    }

    private static int parseInt(String s, int dflt) {
        try {
            return s == null ? dflt : Integer.parseInt(s);
        } catch (NumberFormatException e) {
            return dflt;
        }
    }
}
