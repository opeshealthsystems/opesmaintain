package com.opesware.maintain.platform.application;

import java.util.List;

public record FieldDef(String name, String label, String type, String ref, List<String> options, boolean required,
                       boolean list, boolean managed, boolean hidden, boolean computed, boolean guarded) {
}
