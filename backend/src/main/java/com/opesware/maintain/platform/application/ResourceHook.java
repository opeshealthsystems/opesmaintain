package com.opesware.maintain.platform.application;

import java.util.List;

/** Domain extension point for a resource's create/update rules and read enrichment. */
public interface ResourceHook {
    String path();

    default void beforeCreate(Object entity) {}

    default void beforeUpdate(Object entity) {}

    default void afterSave(Object entity, boolean created) {}

    default void enrich(List<?> entities) {}
}
