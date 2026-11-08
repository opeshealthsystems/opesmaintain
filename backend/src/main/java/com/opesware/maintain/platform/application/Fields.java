package com.opesware.maintain.platform.application;

import com.opesware.maintain.platform.domain.TenantEntity;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** Typed field access and value conversion for catalogued entities. */
public final class Fields {
    private static final Map<String, Field> CACHE = new ConcurrentHashMap<>();

    private Fields() {}

    private static Field field(Class<?> type, String name) {
        return CACHE.computeIfAbsent(type.getName() + "#" + name, k -> {
            Class<?> c = type;
            while (c != null) {
                try {
                    return c.getField(name);
                } catch (NoSuchFieldException e) {
                    c = c.getSuperclass();
                }
            }
            throw new IllegalArgumentException("No field " + name + " on " + type.getSimpleName());
        });
    }

    public static Object get(Object entity, String name) {
        try {
            return field(entity.getClass(), name).get(entity);
        } catch (IllegalAccessException e) {
            throw new IllegalStateException(e);
        }
    }

    public static void set(Object entity, String name, Object value) {
        try {
            field(entity.getClass(), name).set(entity, value);
        } catch (IllegalAccessException e) {
            throw new IllegalStateException(e);
        }
    }

    public static Object convert(FieldDef f, Object raw) {
        if (raw == null) return null;
        if (raw instanceof String s && s.isBlank()) return null;
        String s = raw.toString().trim();
        try {
            return switch (f.type()) {
                case "str", "text" -> s;
                case "enum" -> {
                    if (!f.options().contains(s)) throw ApiException.invalid(f.label() + ": '" + s + "' is not an allowed value");
                    yield s;
                }
                case "int" -> raw instanceof Number n ? n.intValue() : Integer.parseInt(s);
                case "dec", "money" -> raw instanceof Number ? new BigDecimal(raw.toString()) : new BigDecimal(s);
                case "bool" -> raw instanceof Boolean b ? b : Boolean.parseBoolean(s);
                case "date" -> LocalDate.parse(s.length() > 10 ? s.substring(0, 10) : s);
                case "datetime" -> parseInstant(s);
                case "ref" -> UUID.fromString(s);
                default -> s;
            };
        } catch (ApiException e) {
            throw e;
        } catch (RuntimeException e) {
            throw ApiException.invalid(f.label() + ": invalid " + f.type() + " value '" + s + "'");
        }
    }

    public static Instant parseInstant(String s) {
        if (s.endsWith("Z") || s.matches(".*[+-]\\d\\d:\\d\\d$")) return OffsetDateTime.parse(s).toInstant();
        if (s.length() == 16) s = s + ":00";
        return LocalDateTime.parse(s).toInstant(ZoneOffset.UTC);
    }

    public static Object toJson(Object v) {
        if (v == null) return null;
        if (v instanceof BigDecimal b) return b.stripTrailingZeros().scale() <= 0 ? b.setScale(0) : b.stripTrailingZeros();
        if (v instanceof Instant || v instanceof LocalDate || v instanceof UUID) return v.toString();
        return v;
    }

    public static UUID id(Object entity) {
        return ((TenantEntity) entity).id;
    }
}
