package com.opesware.maintain.onboarding.application;

import java.util.Map;
import tools.jackson.databind.JsonNode;

/** Maps catalog vocabulary onto the platform's own enums. */
final class CatalogMapping {
    private CatalogMapping() {}

    /** Functional system → asset.assetType; individual classes may override. */
    private static final Map<String, String> BY_SYSTEM = Map.ofEntries(
            Map.entry("LIFE_SUPPORT", "MEDICAL_DEVICE"), Map.entry("OPERATING_THEATER", "MEDICAL_DEVICE"),
            Map.entry("DIAG_IMAGING", "MEDICAL_DEVICE"), Map.entry("CLINICAL_LAB", "LABORATORY"),
            Map.entry("CSSD_MEDGAS", "MEDICAL_DEVICE"), Map.entry("BTS_POWER", "ELECTRICAL"),
            Map.entry("TOWER_COOLING", "HVAC"), Map.entry("THERMAL_PNEUMATIC", "PRODUCTION"),
            Map.entry("PROCESS_PACKAGING", "PRODUCTION"), Map.entry("PLANT_ELEC_WATER", "ELECTRICAL"),
            Map.entry("ROAD_VEHICLES", "VEHICLE"), Map.entry("MATERIAL_HANDLING", "VEHICLE"),
            Map.entry("HVAC_VERTICAL", "HVAC"), Map.entry("LIFE_SAFETY_UTIL", "BUILDING"));

    private static final Map<String, String> BY_CLASS = Map.ofEntries(
            Map.entry("AC-HLTH-011", "MEDICAL_DEVICE"), Map.entry("AC-TEL-001", "GENERATOR"),
            Map.entry("AC-TEL-005", "BUILDING"), Map.entry("AC-MFG-003", "HVAC"),
            Map.entry("AC-MFG-009", "PLUMBING"), Map.entry("AC-FLT-005", "PRODUCTION"),
            Map.entry("AC-FLT-006", "OTHER"), Map.entry("AC-FAC-003", "BUILDING"),
            Map.entry("AC-FAC-006", "PLUMBING"), Map.entry("AC-FAC-007", "GENERATOR"),
            Map.entry("AC-FAC-008", "ELECTRICAL"), Map.entry("AC-FAC-009", "PLUMBING"));

    static String assetType(JsonNode assetClass, String systemCode) {
        String id = assetClass.path("asset_class_id").asString();
        return BY_CLASS.getOrDefault(id, BY_SYSTEM.getOrDefault(systemCode, "OTHER"));
    }

    /** Catalog criticality → asset.criticality. */
    static String criticality(String c) {
        return switch (c == null ? "" : c) {
            case "CRITICAL" -> "A_CRITICAL";
            case "HIGH" -> "B_HIGH";
            case "MEDIUM" -> "C_MEDIUM";
            default -> "D_LOW";
        };
    }

    /** Catalog safety protocol permit type → work-permit permitType. */
    static String permitType(String p) {
        return switch (p == null ? "" : p) {
            case "ELECTRICAL_ISOLATION" -> "ELECTRICAL_ISOLATION";
            case "AT_HEIGHT_PERMIT" -> "WORK_AT_HEIGHT";
            default -> "GENERAL";
        };
    }
}
