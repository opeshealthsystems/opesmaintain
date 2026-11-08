package com.opesware.maintain.platform.application;

import java.util.List;
import java.util.Set;

public record ResourceDef(String path, Class<?> entity, String context, String module, String label, String singular,
                          String prefix, String display, boolean readonly, Set<String> writerRoles,
                          List<FieldDef> fields) {

    public FieldDef field(String name) {
        for (FieldDef f : fields) if (f.name().equals(name)) return f;
        return null;
    }

    public boolean has(String name) { return field(name) != null; }
}
