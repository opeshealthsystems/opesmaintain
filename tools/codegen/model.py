"""
OPES Maintain resource model — single source of truth for typed entities,
Flyway DDL, REST resource metadata and the web UI registry.

Field DSL:  name:type[flags]
  types : str | text | int | dec | money | bool | date | datetime
          enum(A|B|C) | ref(resource-path)
  flags : !  required
          *  shown as list column
          ~  server-managed (read-only for clients)
          #  hidden (never serialized, never patched)
          ^  computed/transient (not persisted)
"""

PRIORITY = "enum(CRITICAL|HIGH|MEDIUM|LOW|PLANNED)"
WORK_TYPE = "enum(CORRECTIVE|PREVENTIVE|EMERGENCY|INSPECTION|CALIBRATION)"
ROLES = "enum(ADMIN|MANAGER|PLANNER|DISPATCHER|TECHNICIAN|STOREKEEPER|SAFETY_OFFICER|CALIBRATION_OFFICER|COMMERCIAL|PROCUREMENT|AUDITOR|CUSTOMER)"
ACTIVE_INACTIVE = "enum(ACTIVE|INACTIVE)"

# module code -> (title, group, icon)
MODULES = {
    "M01": ("Organization & Tenants", "Administration", "Building2"),
    "M02": ("Identity & Access", "Administration", "ShieldCheck"),
    "M03": ("Asset Registry", "Assets", "Boxes"),
    "M04": ("Locations & Facilities", "Assets", "MapPin"),
    "M05": ("Equipment Passport", "Assets", "QrCode"),
    "M06": ("Configuration & Audit", "Administration", "Settings"),
    "M07": ("Maintenance Requests", "Maintenance", "Inbox"),
    "M08": ("Work Orders", "Maintenance", "ClipboardList"),
    "M09": ("Preventive Maintenance", "Maintenance", "CalendarClock"),
    "M10": ("Scheduling & Dispatch", "Workforce", "CalendarRange"),
    "M11": ("Technician Mobile", "Workforce", "Smartphone"),
    "M12": ("Digital Inspections", "Safety & Compliance", "ClipboardCheck"),
    "M13": ("Breakdown & Downtime", "Reliability", "TriangleAlert"),
    "M14": ("Equipment Metering", "Assets", "Gauge"),
    "M15": ("Spare Parts & Inventory", "Inventory", "Package"),
    "M16": ("Labor & Job Costing", "Workforce", "Timer"),
    "M17": ("Customer Management", "Commercial", "Users"),
    "M18": ("Contracts & SLAs", "Commercial", "FileSignature"),
    "M19": ("Quotation & Billing", "Commercial", "Receipt"),
    "M20": ("Customer Portal", "Commercial", "Globe"),
    "M21": ("Vendor & Procurement", "Procurement", "ShoppingCart"),
    "M22": ("Safety & Work Permits", "Safety & Compliance", "HardHat"),
    "M23": ("Calibration & Compliance", "Safety & Compliance", "Ruler"),
    "M24": ("Reliability & Analytics", "Reliability", "ChartLine"),
    "M25": ("Documents & Reporting", "Documents", "FileText"),
    "M26": ("Fleet & Specialized Assets", "Assets", "Truck"),
    "M27": ("IoT & Condition Monitoring", "Reliability", "Activity"),
    "M28": ("AI Maintenance Intelligence", "Reliability", "Sparkles"),
}

# context -> roles allowed to write (ADMIN always allowed)
CONTEXT_WRITERS = {
    "organization": ["MANAGER"],
    "identity": [],
    "asset": ["MANAGER", "PLANNER"],
    "maintenance": ["MANAGER", "PLANNER", "DISPATCHER", "TECHNICIAN"],
    "workforce": ["MANAGER", "PLANNER", "DISPATCHER", "TECHNICIAN"],
    "inventory": ["MANAGER", "STOREKEEPER"],
    "safety": ["MANAGER", "SAFETY_OFFICER", "TECHNICIAN"],
    "calibration": ["MANAGER", "CALIBRATION_OFFICER"],
    "reliability": ["MANAGER", "PLANNER", "TECHNICIAN"],
    "commercial": ["MANAGER", "COMMERCIAL"],
    "procurement": ["MANAGER", "PROCUREMENT", "STOREKEEPER"],
    "documents": ["MANAGER", "PLANNER", "TECHNICIAN", "SAFETY_OFFICER", "CALIBRATION_OFFICER", "COMMERCIAL"],
    "integration": ["MANAGER"],
    "platform": [],
}

# Each resource:
#  path, entity, context, module, label (plural), singular, icon, number prefix (or None),
#  display field, fields, options
R = []


def res(path, entity, context, module, label, singular, icon, fields, prefix=None, display=None,
        readonly=False, guarded=None, writers=None, desc="", unique=None):
    R.append(dict(path=path, entity=entity, context=context, module=module, label=label,
                  singular=singular, icon=icon, fields=fields, prefix=prefix, display=display,
                  readonly=readonly, guarded=guarded or [], writers=writers, desc=desc, unique=unique or []))


# ---------------------------------------------------------------- organization
res("organizations", "Organization", "organization", "M01", "Organizations", "Organization", "Building2", [
    "code:str!*", "name:str!*", "kind:enum(OWNER|CLIENT|SERVICE_PROVIDER|VENDOR)!*", "legalName:str",
    "country:str*", "timeZone:str", "currency:str", "language:enum(EN|FR)", "plan:enum(STANDARD|PROFESSIONAL|ENTERPRISE)",
    "taxId:str", "email:str", "phone:str", "address:text", "status:enum(ACTIVE|SUSPENDED|ARCHIVED)*",
], display="name", desc="Legal entities, companies, clients and service providers.")

res("service-grants", "ServiceGrant", "organization", "M01", "Service Grants", "Service Grant", "KeyRound", [
    "providerOrgId:ref(organizations)!*", "clientOrgId:ref(organizations)!*",
    "scope:enum(ALL_SITES|SELECTED_SITES|SELECTED_ASSETS)!*", "siteIds:text", "assetIds:text",
    "validFrom:date!*", "validTo:date!*", "status:enum(ACTIVE|REVOKED|EXPIRED)~*", "revokedReason:text~",
], prefix="SG", display="number", guarded=["status"],
    desc="Bounded provider-to-client access grants with expiry and revocation.")

res("sites", "Site", "organization", "M04", "Sites", "Site", "Factory", [
    "code:str!*", "name:str!*", "organizationId:ref(organizations)*", "country:str", "region:str", "city:str*",
    "address:text", "timeZone:str!", "latitude:dec", "longitude:dec", "locationTrackingEnabled:bool",
    "status:" + ACTIVE_INACTIVE + "*",
], display="name", desc="Operational sites with their local time zone.")

res("locations", "Location", "organization", "M04", "Locations", "Location", "MapPin", [
    "code:str*", "name:str!*", "siteId:ref(sites)!*", "kind:enum(BUILDING|FLOOR|ZONE|ROOM|PRODUCTION_LINE|POINT)!*",
    "parentId:ref(locations)", "latitude:dec", "longitude:dec", "status:" + ACTIVE_INACTIVE + "*",
], display="name", desc="Buildings, floors, zones, rooms and production lines.")

# ---------------------------------------------------------------- identity
res("users", "AppUser", "identity", "M02", "Users", "User", "UserRound", [
    "fullName:str!*", "email:str!*", "role:" + ROLES + "!*", "organizationId:ref(organizations)",
    "siteId:ref(sites)*", "customerId:ref(customers)", "jobTitle:str", "phone:str", "language:enum(EN|FR)",
    "mfaEnabled:bool*", "status:enum(ACTIVE|SUSPENDED|OFFBOARDED)*", "lastLoginAt:datetime~", "passwordHash:str#",
    "mfaEnrolledAt:datetime~@3", "mfaSecret:str#@3", "failedLogins:int#@3", "lockedUntil:datetime~@3",
    "tokensValidAfter:datetime#@3", "emailNotifications:bool@3",
    "resetTokenHash:str#@4", "resetTokenExpires:datetime#@4",
], display="fullName", unique=["email"], desc="Memberships, roles and site scope.")

res("delegations", "Delegation", "identity", "M02", "Delegations", "Delegation", "UserCheck", [
    "delegatorId:ref(users)!*", "delegateId:ref(users)!*",
    "permission:enum(APPROVE_WORK_ORDERS|APPROVE_PURCHASES|ISSUE_PERMITS|APPROVE_QUOTES|REVIEW_WORK)!*",
    "validFrom:datetime!*", "validTo:datetime!*", "reason:text!", "reviewerId:ref(users)",
    "status:enum(ACTIVE|REVOKED|EXPIRED)*",
], display="permission", desc="Temporary delegation with validity window and reviewer.")

res("devices", "Device", "identity", "M02", "Devices", "Device", "Smartphone", [
    "userId:ref(users)!*", "name:str!*", "platform:enum(ANDROID|IOS|WEB)*", "appVersion:str",
    "lastSyncAt:datetime*", "status:enum(TRUSTED|REVOKED)*",
], display="name", desc="Registered technician devices; revocation applies at next online check.")

# ---------------------------------------------------------------- asset
res("assets", "Asset", "asset", "M03", "Assets", "Asset", "Boxes", [
    "tag:str!*", "name:str!*",
    "assetType:enum(MEDICAL_DEVICE|HVAC|ELECTRICAL|PLUMBING|GENERATOR|VEHICLE|PRODUCTION|IT|LABORATORY|BUILDING|OTHER)!*",
    "category:str", "manufacturer:str*", "model:str", "serialNumber:str",
    "criticality:enum(A_CRITICAL|B_HIGH|C_MEDIUM|D_LOW)!*",
    "status:enum(PROPOSED|ACTIVE|OUT_OF_SERVICE|UNDER_MAINTENANCE|QUARANTINED|RETIRED|DISPOSED)*",
    "safetyState:enum(CLEAR|RESTRICTED|LOCKED_OUT|PERMIT_REQUIRED)*",
    "siteId:ref(sites)!*", "locationId:ref(locations)", "parentId:ref(assets)", "customerId:ref(customers)",
    "ownerOrgId:ref(organizations)", "custodian:str", "purchaseDate:date", "purchaseCost:money",
    "commissionedOn:date", "warrantyEnd:date", "expectedLifeYears:int", "externalRef:str", "notes:text",
], display="name", guarded=["status", "safetyState", "siteId"],
    desc="Typed equipment records with hierarchy, ownership and lifecycle.")

res("asset-events", "AssetEvent", "asset", "M03", "Asset History", "Asset Event", "History", [
    "assetId:ref(assets)!*", "eventType:enum(REGISTERED|STATUS_CHANGED|SAFETY_CHANGED|TRANSFERRED|COMMISSIONED|OVERHAULED|RETIRED|DISPOSED)*",
    "fromValue:str*", "toValue:str*", "reason:text*", "effectiveAt:datetime*", "actor:str*",
], display="eventType", readonly=True, desc="Append-only lifecycle history.")

res("passport-tokens", "PassportToken", "asset", "M05", "Passport Tokens", "Passport Token", "QrCode", [
    "assetId:ref(assets)!*", "token:str~*", "status:enum(ACTIVE|REVOKED)~*", "issuedAt:datetime~*",
    "revokedAt:datetime~", "scanCount:int~*",
], display="token", guarded=["status"], readonly=True, unique=["token"], desc="Rotatable QR reference tokens.")

res("meters", "Meter", "asset", "M14", "Meters", "Meter", "Gauge", [
    "assetId:ref(assets)!*", "name:str!*", "meterType:enum(CUMULATIVE|INSTANTANEOUS)!*", "unit:str!*",
    "lastReading:dec~*", "lastReadingAt:datetime~*", "minValue:dec", "maxValue:dec",
    "status:enum(ACTIVE|REPLACED|RETIRED)*",
], display="name", desc="Runtime, odometer, cycle and condition meters.")

res("meter-readings", "MeterReading", "asset", "M14", "Meter Readings", "Meter Reading", "LineChart", [
    "meterId:ref(meters)!*", "assetId:ref(assets)~*", "value:dec!*", "readingAt:datetime!*",
    "source:enum(MANUAL|MOBILE|IOT|IMPORT)*", "accepted:bool~*", "rejectionReason:str~", "note:text",
], display="value", writers=["MANAGER", "PLANNER", "TECHNICIAN"], desc="Recorded measurements with acceptance checks.")

res("vehicles", "Vehicle", "asset", "M26", "Fleet Vehicles", "Vehicle", "Truck", [
    "assetId:ref(assets)!*", "plateNumber:str!*", "vin:str", "make:str*", "model:str*", "year:int",
    "fuelType:enum(DIESEL|PETROL|ELECTRIC|HYBRID|LPG)*", "odometerKm:dec*", "driverName:str*",
    "insuranceExpiry:date*", "inspectionExpiry:date", "status:enum(AVAILABLE|IN_USE|IN_SERVICE|OFF_ROAD)*",
], display="plateNumber", desc="Vehicles and mobile specialized assets.")

res("fuel-logs", "FuelLog", "asset", "M26", "Fuel Logs", "Fuel Log", "Fuel", [
    "vehicleId:ref(vehicles)!*", "filledAt:datetime!*", "liters:dec!*", "cost:money*", "odometerKm:dec*",
    "station:str", "driverName:str*",
], display="filledAt", desc="Fuel consumption and odometer records.")

# ---------------------------------------------------------------- maintenance
res("maintenance-requests", "MaintenanceRequest", "maintenance", "M07", "Maintenance Requests", "Request", "Inbox", [
    "number:str~*", "title:str!*", "description:text!", "assetId:ref(assets)*", "siteId:ref(sites)!*",
    "locationId:ref(locations)", "reportedBy:str*", "reporterContact:str", "priority:" + PRIORITY + "!*",
    "category:enum(BREAKDOWN|SAFETY|CLEANING|ELECTRICAL|MECHANICAL|PLUMBING|IT|OTHER)*",
    "channel:enum(WEB|MOBILE|PORTAL|PHONE|EMAIL|QR)*",
    "status:enum(SUBMITTED|ACKNOWLEDGED|TRIAGED|CONVERTED|REJECTED|DUPLICATE_LINKED)~*",
    "customerId:ref(customers)", "workOrderId:ref(work-orders)~", "duplicateOfId:ref(maintenance-requests)~",
    "receivedAt:datetime~*", "acknowledgedAt:datetime~", "triageNote:text~",
], prefix="MR", display="title", guarded=["status"], desc="Fault intake, triage and conversion.")

res("work-orders", "WorkOrder", "maintenance", "M08", "Work Orders", "Work Order", "ClipboardList", [
    "number:str~*", "title:str!*", "description:text", "workType:" + WORK_TYPE + "!*", "priority:" + PRIORITY + "!*",
    "status:enum(DRAFT|TRIAGED|APPROVED|PLANNED|DISPATCHED|IN_PROGRESS|WORK_COMPLETED|REVIEWED|CLOSED|ON_HOLD|CANCELLED)~*",
    "previousStatus:str~", "assetId:ref(assets)*", "assetSnapshot:text~", "siteId:ref(sites)!*",
    "locationId:ref(locations)", "requestId:ref(maintenance-requests)~", "pmPlanId:ref(pm-plans)~",
    "parentWorkOrderId:ref(work-orders)~", "customerId:ref(customers)", "contractId:ref(service-contracts)",
    "assigneeId:ref(technicians)*", "plannedStart:datetime", "plannedEnd:datetime", "dueAt:datetime*",
    "estimatedHours:dec", "actualStart:datetime~", "actualEnd:datetime~", "permitRequired:bool",
    "permitId:ref(work-permits)", "failureCode:str", "causeCode:str", "remedyCode:str", "closeoutCode:str~",
    "completionNotes:text", "completedBy:str~", "reviewedBy:str~", "laborCost:money~", "partsCost:money~",
    "slaDueAt:datetime~", "slaBreached:bool~*", "holdReason:str~", "cancelReason:str~",
], prefix="WO", display="title", guarded=["status"], desc="Guarded work-order lifecycle.")

res("work-tasks", "WorkTask", "maintenance", "M08", "Work Tasks", "Task", "ListChecks", [
    "workOrderId:ref(work-orders)!*", "sequence:int*", "description:str!*", "required:bool*",
    "status:enum(PENDING|DONE|SKIPPED|FAILED)~*", "result:text", "measuredValue:str", "completedBy:str~",
    "completedAt:datetime~",
], display="description", desc="Task checklist and evidence per work order.")

res("pm-plans", "PmPlan", "maintenance", "M09", "PM Plans", "PM Plan", "CalendarClock", [
    "code:str~*", "name:str!*", "assetId:ref(assets)!*", "siteId:ref(sites)~",
    "triggerType:enum(CALENDAR|METER|CALENDAR_OR_METER)!*", "intervalValue:int", "intervalUnit:enum(DAY|WEEK|MONTH|YEAR)*",
    "scheduleMode:enum(FIXED|AFTER_COMPLETION)*", "anchorDate:date!*", "timeZone:str", "dueWindowDays:int",
    "leadDays:int", "meterId:ref(meters)", "meterInterval:dec", "nextMeterThreshold:dec~",
    "workType:" + WORK_TYPE, "priority:" + PRIORITY, "estimatedHours:dec", "taskList:text",
    "planVersion:int~*", "status:enum(DRAFT|APPROVED|ACTIVE|PAUSED|RETIRED)~*", "nextDueAt:datetime~*",
    "lastGeneratedAt:datetime~",
], prefix="PM", display="name", guarded=["status"], writers=['MANAGER', 'PLANNER'], desc="Versioned calendar and meter-based plans.")

res("pm-occurrences", "PmOccurrence", "maintenance", "M09", "PM Occurrences", "PM Occurrence", "CalendarCheck", [
    "planId:ref(pm-plans)!*", "planVersion:int*", "occurrenceKey:str*", "dueAt:datetime*", "localDue:str*",
    "workOrderId:ref(work-orders)*", "status:enum(SCHEDULED|GENERATED|COMPLETED|SKIPPED|MISSED)*",
    "completedAt:datetime",
], display="occurrenceKey", readonly=True, desc="Idempotent generated occurrences.")

# ---------------------------------------------------------------- workforce
res("technicians", "Technician", "workforce", "M10", "Technicians", "Technician", "HardHat", [
    "userId:ref(users)*", "fullName:str!*", "employeeNo:str*",
    "trade:enum(BIOMEDICAL|ELECTRICAL|MECHANICAL|HVAC|PLUMBING|IT|CIVIL|GENERAL)!*", "skills:text",
    "certifications:text", "hourlyRate:money*", "siteId:ref(sites)*", "shift:enum(DAY|NIGHT|ROTATING|ON_CALL)*",
    "availability:enum(AVAILABLE|ON_JOB|OFF_SHIFT|LEAVE)*", "contractor:bool", "contractorOrgId:ref(organizations)",
    "phone:str",
], display="fullName", writers=['MANAGER', 'PLANNER', 'DISPATCHER'], desc="Workforce, skills, rates and availability.")

res("assignments", "Assignment", "workforce", "M10", "Assignments", "Assignment", "CalendarRange", [
    "workOrderId:ref(work-orders)!*", "technicianId:ref(technicians)!*", "scheduledStart:datetime!*",
    "scheduledEnd:datetime!*", "role:enum(LEAD|SUPPORT)*",
    "status:enum(PLANNED|DISPATCHED|ACCEPTED|DECLINED|COMPLETED|CANCELLED)*", "note:text",
], display="scheduledStart", writers=['MANAGER', 'PLANNER', 'DISPATCHER'], desc="Dispatch calendar entries.")

res("time-entries", "TimeEntry", "workforce", "M16", "Time Entries", "Time Entry", "Timer", [
    "workOrderId:ref(work-orders)!*", "technicianId:ref(technicians)!*", "startedAt:datetime!*", "endedAt:datetime!*",
    "hours:dec~*", "rate:money~", "cost:money~*", "laborType:enum(REGULAR|OVERTIME|TRAVEL|STANDBY)*",
    "approved:bool~*", "note:text",
], display="startedAt", desc="Labor time with rate-based job costing.")

# ---------------------------------------------------------------- safety
res("inspection-templates", "InspectionTemplate", "safety", "M12", "Inspection Templates", "Inspection Template", "ClipboardCheck", [
    "code:str*", "name:str!*", "assetType:str*", "templateVersion:int*", "status:enum(DRAFT|PUBLISHED|RETIRED)*",
    "questions:text!", "passThreshold:int",
], display="name", writers=['MANAGER', 'SAFETY_OFFICER'], desc="Controlled checklists, one question per line.")

res("inspection-results", "InspectionResult", "safety", "M12", "Inspection Results", "Inspection Result", "FileCheck", [
    "templateId:ref(inspection-templates)!*", "assetId:ref(assets)!*", "workOrderId:ref(work-orders)",
    "inspector:str*", "performedAt:datetime!*", "answers:text", "score:int*",
    "outcome:enum(PASS|FAIL|CONDITIONAL)!*", "defectsFound:text", "followUpWorkOrderId:ref(work-orders)~",
], display="performedAt", desc="Completed inspections; failures raise follow-up work.")

res("work-permits", "WorkPermit", "safety", "M22", "Work Permits", "Work Permit", "FileLock", [
    "number:str~*", "permitType:enum(HOT_WORK|ELECTRICAL_ISOLATION|CONFINED_SPACE|WORK_AT_HEIGHT|EXCAVATION|GENERAL)!*",
    "siteId:ref(sites)!*", "assetId:ref(assets)*", "workOrderId:ref(work-orders)*", "scope:text!", "hazards:text!",
    "controls:text!", "isolationPoints:text", "validFrom:datetime!*", "validTo:datetime!*", "requestedBy:str~",
    "issuedBy:str~*", "acceptedBy:str*", "status:enum(DRAFT|SUBMITTED|VERIFIED|ISSUED|ACTIVE|SUSPENDED|EXPIRED|CLOSED|REVOKED)~*",
    "revokeReason:str~",
], prefix="PTW", display="number", guarded=["status"], desc="Permit-to-work with issuer separation.")

res("safety-incidents", "SafetyIncident", "safety", "M22", "Safety Incidents", "Safety Incident", "Siren", [
    "number:str~*", "title:str!*", "severity:enum(NEAR_MISS|MINOR|MAJOR|CRITICAL)!*", "occurredAt:datetime!*",
    "siteId:ref(sites)!*", "assetId:ref(assets)", "description:text!", "immediateAction:text", "reportedBy:str*",
    "status:enum(OPEN|INVESTIGATING|ACTIONS_ASSIGNED|CLOSED)*",
], prefix="INC", display="title", desc="Incident and near-miss register.")

# ---------------------------------------------------------------- calibration
res("calibration-plans", "CalibrationPlan", "calibration", "M23", "Calibration Plans", "Calibration Plan", "CalendarClock", [
    "assetId:ref(assets)!*", "standard:str*", "intervalMonths:int!*", "tolerance:str*", "lastCalibratedOn:date~*",
    "nextDueOn:date*", "provider:str*", "status:enum(ACTIVE|SUSPENDED)*",
], display="standard", desc="Calibration schedules per instrument.")

res("calibration-events", "CalibrationEvent", "calibration", "M23", "Calibration Events", "Calibration Event", "Ruler", [
    "number:str~*", "planId:ref(calibration-plans)*", "assetId:ref(assets)!*", "scheduledOn:date!*", "performedOn:date*",
    "performedBy:str*", "referenceStandard:str", "asFound:text", "asLeft:text", "asFoundInTolerance:bool*",
    "asLeftInTolerance:bool*", "certificateNo:str*",
    "status:enum(SCHEDULED|AS_FOUND|ADJUSTED|AS_LEFT|REVIEWED|APPROVED|REJECTED)~*",
    "eligibility:enum(ELIGIBLE|RESTRICTED)~*", "investigationRequired:bool~*", "approvedBy:str~",
], prefix="CAL", display="number", guarded=["status"], desc="As-found / as-left results and approval.")

res("compliance-items", "ComplianceItem", "calibration", "M23", "Compliance Register", "Compliance Item", "BadgeCheck", [
    "name:str!*", "regulation:str*", "assetType:str", "assetId:ref(assets)", "frequency:enum(MONTHLY|QUARTERLY|SEMI_ANNUAL|ANNUAL|BIENNIAL)*",
    "nextDue:date*", "owner:str*", "status:enum(COMPLIANT|DUE|OVERDUE|NOT_APPLICABLE)*", "evidenceNote:text",
], display="name", desc="Statutory and internal compliance obligations.")

# ---------------------------------------------------------------- reliability
res("downtime-events", "DowntimeEvent", "reliability", "M13", "Downtime Events", "Downtime Event", "TriangleAlert", [
    "assetId:ref(assets)!*", "workOrderId:ref(work-orders)", "startedAt:datetime!*", "endedAt:datetime*",
    "durationHours:dec~*", "downtimeType:enum(UNPLANNED|PLANNED|STANDBY)!*", "failureMode:str*", "failureCause:str",
    "impact:enum(PRODUCTION_STOP|DEGRADED|PATIENT_IMPACT|NONE)*", "status:enum(OPEN|CLOSED)~*",
], display="failureMode", desc="Breakdowns and downtime intervals.")

res("failure-codes", "FailureCode", "reliability", "M13", "Failure Codes", "Failure Code", "Tags", [
    "code:str!*", "name:str!*", "codeType:enum(PROBLEM|CAUSE|REMEDY)!*", "assetType:str*", "active:bool*",
], display="name", writers=['MANAGER', 'PLANNER'], desc="Problem / cause / remedy taxonomy.")

res("ai-insights", "AiInsight", "reliability", "M28", "AI Insights", "Insight", "Sparkles", [
    "assetId:ref(assets)*", "insightType:enum(REPEAT_FAILURE|OVERDUE_PM|LOW_STOCK|METER_ANOMALY|SLA_RISK|CALIBRATION_DUE|SENSOR_ALARM)*",
    "title:str!*", "rationale:text", "confidence:dec*", "suggestedAction:text",
    "status:enum(PROPOSED|ACCEPTED|REJECTED)~*", "reviewedBy:str~", "reviewedAt:datetime~",
], display="title", guarded=["status"], readonly=True, desc="Explainable recommendations requiring human review.")

# ---------------------------------------------------------------- inventory
res("warehouses", "Warehouse", "inventory", "M15", "Warehouses", "Warehouse", "Warehouse", [
    "code:str!*", "name:str!*", "siteId:ref(sites)*", "kind:enum(MAIN_STORE|SATELLITE|VAN|QUARANTINE)*",
    "keeper:str*", "status:" + ACTIVE_INACTIVE + "*",
], display="name", desc="Stores, satellite stores and van stock.")

res("parts", "Part", "inventory", "M15", "Parts Catalog", "Part", "Package", [
    "partNo:str!*", "name:str!*", "category:str*", "unit:str!*", "manufacturer:str", "manufacturerPartNo:str",
    "unitCost:money*", "reorderPoint:dec*", "reorderQty:dec", "criticalSpare:bool*",
    "preferredVendorId:ref(vendors)", "barcode:str", "status:enum(ACTIVE|OBSOLETE)*",
    "onHand:dec^*", "reserved:dec^", "available:dec^*",
], display="name", desc="Spare parts; balances are derived from the movement ledger.")

res("stock-movements", "StockMovement", "inventory", "M15", "Stock Ledger", "Stock Movement", "ArrowLeftRight", [
    "partId:ref(parts)!*", "warehouseId:ref(warehouses)!*",
    "movementType:enum(RECEIPT|ISSUE|RETURN|ADJUSTMENT|TRANSFER_IN|TRANSFER_OUT|SCRAP|QUARANTINE|RELEASE)*",
    "quantity:dec*", "unitCost:money*", "workOrderId:ref(work-orders)*", "reservationId:ref(stock-reservations)",
    "reference:str*", "clientOperationId:str", "reason:text", "occurredAt:datetime*", "actor:str",
], display="reference", readonly=True, desc="Append-only signed movements.")

res("stock-reservations", "StockReservation", "inventory", "M15", "Reservations", "Reservation", "PackageCheck", [
    "partId:ref(parts)!*", "warehouseId:ref(warehouses)!*", "workOrderId:ref(work-orders)!*", "quantity:dec!*",
    "issuedQty:dec~*", "status:enum(OPEN|ISSUED|RELEASED|CANCELLED)~*", "clientOperationId:str~",
], display="quantity", readonly=True, desc="Atomic reservations against work orders.")

res("cycle-counts", "CycleCount", "inventory", "M15", "Cycle Counts", "Cycle Count", "ScanBarcode", [
    "warehouseId:ref(warehouses)!*", "partId:ref(parts)!*", "countedQty:dec!*", "systemQty:dec~*",
    "variance:dec~*", "countedAt:datetime*", "countedBy:str*", "status:enum(DRAFT|POSTED)~*",
], display="countedAt", guarded=["status"], desc="Physical counts posted as adjustments.")

# ---------------------------------------------------------------- commercial
res("customers", "Customer", "commercial", "M17", "Customers", "Customer", "Users", [
    "code:str!*", "name:str!*", "organizationId:ref(organizations)",
    "industry:enum(HEALTHCARE|PHARMA|MANUFACTURING|HOSPITALITY|GOVERNMENT|EDUCATION|ENERGY|OTHER)*",
    "contactName:str*", "email:str*", "phone:str*", "billingAddress:text", "taxId:str", "paymentTerms:str",
    "status:enum(PROSPECT|ACTIVE|ON_HOLD|INACTIVE)*",
], display="name", desc="Customer register for service providers.")

res("sla-policies", "SlaPolicy", "commercial", "M18", "SLA Policies", "SLA Policy", "Timer", [
    "name:str!*", "priority:" + PRIORITY + "!*", "responseHours:dec!*", "resolutionHours:dec!*",
    "clockStart:enum(RECEIPT|ACKNOWLEDGMENT)*", "businessHoursOnly:bool*", "calendar:str",
], display="name", desc="Response and resolution targets.")

res("service-contracts", "ServiceContract", "commercial", "M18", "Service Contracts", "Service Contract", "FileSignature", [
    "number:str~*", "customerId:ref(customers)!*", "title:str!*",
    "contractType:enum(FULL_SERVICE|PREVENTIVE_ONLY|ON_CALL|PARTS_AND_LABOR|WARRANTY)!*", "slaPolicyId:ref(sla-policies)*",
    "startDate:date!*", "endDate:date!*", "value:money*", "currency:str", "billingCycle:enum(MONTHLY|QUARTERLY|ANNUAL|PER_JOB)*",
    "coveredAssets:text", "autoRenew:bool", "status:enum(DRAFT|ACTIVE|SUSPENDED|EXPIRED|TERMINATED)*",
], prefix="SC", display="title", desc="Maintenance contracts and renewals.")

res("quotes", "Quote", "commercial", "M19", "Quotations", "Quotation", "Receipt", [
    "number:str~*", "customerId:ref(customers)!*", "workOrderId:ref(work-orders)", "title:str!*",
    "laborAmount:money", "partsAmount:money", "taxRate:dec", "total:money~*", "currency:str", "validUntil:date*",
    "status:enum(DRAFT|SENT|APPROVED|REJECTED|EXPIRED)~*", "approvedBy:str~", "approvedAt:datetime~", "notes:text",
], prefix="QT", display="title", guarded=["status"], desc="Quotations with approval.")

res("billing-exports", "BillingExport", "commercial", "M19", "Billing Exports", "Billing Export", "FileOutput", [
    "number:str~*", "customerId:ref(customers)!*", "contractId:ref(service-contracts)", "periodStart:date!*",
    "periodEnd:date!*", "workOrderCount:int~*", "amount:money~*", "currency:str",
    "targetSystem:enum(OPES_ERP|SAGE|ODOO|QUICKBOOKS|CSV)*", "status:enum(PENDING|ACKNOWLEDGED|REJECTED|REVERSED)~*",
    "externalRef:str",
], prefix="BX", display="number", desc="Closed-work billing batches for ERP.")

res("service-signoffs", "ServiceSignoff", "commercial", "M20", "Customer Sign-offs", "Sign-off", "Signature", [
    "workOrderId:ref(work-orders)!*", "customerId:ref(customers)*", "signedBy:str!*", "signedAt:datetime~*",
    "rating:int*", "accepted:bool*", "comment:text",
], display="signedBy", desc="Customer acceptance of completed service.")

# ---------------------------------------------------------------- procurement
res("vendors", "Vendor", "procurement", "M21", "Vendors", "Vendor", "Store", [
    "code:str!*", "name:str!*", "category:enum(PARTS|SERVICES|CALIBRATION|OEM|CONTRACTOR)*", "contactName:str*",
    "email:str*", "phone:str", "country:str*", "rating:int*", "approved:bool*", "status:" + ACTIVE_INACTIVE + "*",
], display="name", desc="Approved supplier register.")

res("purchase-requisitions", "PurchaseRequisition", "procurement", "M21", "Requisitions", "Requisition", "ClipboardPen", [
    "number:str~*", "partId:ref(parts)*", "description:str!*", "quantity:dec!*", "estimatedCost:money*",
    "requestedBy:str*", "neededBy:date*", "workOrderId:ref(work-orders)",
    "status:enum(DRAFT|SUBMITTED|APPROVED|REJECTED|ORDERED)~*",
], prefix="PR", display="description", desc="Internal purchase requests.")

res("purchase-orders", "PurchaseOrder", "procurement", "M21", "Purchase Orders", "Purchase Order", "ShoppingCart", [
    "number:str~*", "vendorId:ref(vendors)!*", "requisitionId:ref(purchase-requisitions)", "partId:ref(parts)*",
    "quantity:dec!*", "unitPrice:money!*", "total:money~*", "currency:str", "orderDate:date*", "expectedDate:date*",
    "warehouseId:ref(warehouses)", "receivedQty:dec~*",
    "status:enum(DRAFT|ISSUED|PARTIALLY_RECEIVED|RECEIVED|CANCELLED)~*",
], prefix="PO", display="number", guarded=["status"], desc="Orders with receipt into stock.")

# ---------------------------------------------------------------- documents
res("documents", "Document", "documents", "M25", "Documents", "Document", "FileText", [
    "title:str!*", "docType:enum(MANUAL|WARRANTY|CERTIFICATE|SERVICE_REPORT|PHOTO|SOP|DRAWING|CONTRACT|OTHER)!*",
    "entityType:str*", "entityId:str", "fileName:str~*", "contentType:str~", "sizeBytes:int~",
    "checksumSha256:str~", "storageKey:str#", "status:enum(STAGED|SCANNING|ACCEPTED|QUARANTINED|REJECTED|SUPERSEDED)~*",
    "retentionUntil:date", "confidential:bool*",
], display="title", desc="Evidence and documents with checksum and retention.")

res("report-jobs", "ReportJob", "documents", "M25", "Report Jobs", "Report Job", "FileBarChart",[
    "reportType:enum(WORK_ORDER_SUMMARY|ASSET_REGISTER|PM_COMPLIANCE|INVENTORY_VALUATION|SLA_PERFORMANCE|DOWNTIME|CALIBRATION_STATUS|COST_BY_SITE)!*",
    "parameters:text", "status:enum(QUEUED|RUNNING|COMPLETED|FAILED)~*", "requestedBy:str~*", "completedAt:datetime~*",
    "rowCount:int~",
], display="reportType", desc="Authorized report runs.")

# ---------------------------------------------------------------- integration
res("integrations", "Integration", "integration", "M27", "Integrations", "Integration", "Plug", [
    "name:str!*", "kind:enum(ERP|IDENTITY|IOT_GATEWAY|BMS|SCADA_READONLY|HIS|WEBHOOK)!*", "endpoint:str*",
    "authType:enum(NONE|API_KEY|OAUTH2|MTLS)", "status:enum(ENABLED|DISABLED|ERROR)*", "lastTestAt:datetime~*",
    "lastTestResult:str~*",
], display="name", desc="External connectors (read-only industrial ingestion).")

res("webhook-subscriptions", "WebhookSubscription", "integration", "M27", "Webhooks", "Webhook", "Webhook", [
    "url:str!*", "eventTypes:text!*", "secretHint:str~", "status:enum(ACTIVE|PAUSED)*", "lastDeliveryAt:datetime~*",
], display="url", desc="Signed outbound event subscriptions.")

res("sensors", "Sensor", "integration", "M27", "Sensors", "Sensor", "Radio", [
    "assetId:ref(assets)!*", "name:str!*", "sensorType:enum(TEMPERATURE|VIBRATION|PRESSURE|HUMIDITY|CURRENT|RUNTIME|FLOW)!*",
    "unit:str*", "warnLow:dec", "warnHigh:dec", "alarmLow:dec", "alarmHigh:dec", "lastValue:dec~*",
    "lastSeenAt:datetime~*", "status:enum(ONLINE|OFFLINE|WARNING|ALARM)~*", "gateway:str",
], display="name", desc="Condition monitoring points.")

res("sensor-alerts", "SensorAlert", "integration", "M27", "Sensor Alerts", "Sensor Alert", "BellRing", [
    "sensorId:ref(sensors)!*", "assetId:ref(assets)~*", "severity:enum(WARNING|ALARM)*", "value:dec*", "threshold:dec*",
    "raisedAt:datetime*", "status:enum(OPEN|ACKNOWLEDGED|CONVERTED|CLEARED)~*", "workOrderId:ref(work-orders)~",
], display="severity", readonly=True, desc="Threshold alerts awaiting human action.")

res("outbox-events", "OutboxEvent", "integration", "M27", "Event Outbox", "Outbox Event", "Send", [
    "eventType:str*", "aggregateType:str*", "aggregateId:str*", "status:enum(PENDING|CLAIMED|DELIVERED|RETRY|DEAD_LETTER)*",
    "attempts:int*", "occurredAt:datetime*", "payload:text",
], display="eventType", readonly=True, desc="Transactional outbox of domain events.")

# ---------------------------------------------------------------- platform
res("audit-events", "AuditEvent", "platform", "M06", "Audit Trail", "Audit Event", "ScrollText", [
    "occurredAt:datetime*", "actor:str*", "action:str*", "entityType:str*", "entityId:str*", "detail:text*",
], display="action", readonly=True, desc="Immutable audit trail.")

res("settings", "Setting", "platform", "M06", "Settings", "Setting", "SlidersHorizontal", [
    "settingKey:str!*", "settingValue:str!*", "category:str*", "description:text*",
], display="settingKey", desc="Tenant configuration.")

res("notifications", "Notification", "platform", "M06", "Notifications", "Notification", "Bell", [
    "recipient:str*", "channel:enum(IN_APP|EMAIL|SMS)*", "subject:str!*", "body:text", "link:str",
    "status:enum(UNREAD|READ)*", "createdOn:datetime~*", "category:str*@3",
    "emailStatus:enum(NONE|PENDING|SENT|FAILED)~@3", "emailAttempts:int#@3",
], display="subject", desc="In-app notifications.")
