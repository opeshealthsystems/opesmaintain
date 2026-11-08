-- GENERATED baseline schema (see tools/codegen). Later changes go into new versioned migrations.

create table organization (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    code varchar(255),
    name varchar(255),
    kind varchar(64),
    legal_name varchar(255),
    country varchar(255),
    time_zone varchar(255),
    currency varchar(255),
    language varchar(64),
    plan varchar(64),
    tax_id varchar(255),
    email varchar(255),
    phone varchar(255),
    address varchar(8000),
    status varchar(64)
);
create index ix_organization_tenant on organization (tenant_id, created_at);
create index ix_organization_status on organization (tenant_id, status);

create table service_grant (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    number varchar(255),
    provider_org_id uuid,
    client_org_id uuid,
    scope varchar(64),
    site_ids varchar(8000),
    asset_ids varchar(8000),
    valid_from date,
    valid_to date,
    status varchar(64),
    revoked_reason varchar(8000)
);
create index ix_service_grant_tenant on service_grant (tenant_id, created_at);
create index ix_service_grant_number on service_grant (tenant_id, number);
create index ix_service_grant_provider_org_id on service_grant (tenant_id, provider_org_id);
create index ix_service_grant_client_org_id on service_grant (tenant_id, client_org_id);
create index ix_service_grant_status on service_grant (tenant_id, status);
create unique index ux_service_grant_number on service_grant (tenant_id, number);

create table site (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    code varchar(255),
    name varchar(255),
    organization_id uuid,
    country varchar(255),
    region varchar(255),
    city varchar(255),
    address varchar(8000),
    time_zone varchar(255),
    latitude numeric(19,4),
    longitude numeric(19,4),
    location_tracking_enabled boolean,
    status varchar(64)
);
create index ix_site_tenant on site (tenant_id, created_at);
create index ix_site_organization_id on site (tenant_id, organization_id);
create index ix_site_status on site (tenant_id, status);

create table location (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    code varchar(255),
    name varchar(255),
    site_id uuid,
    kind varchar(64),
    parent_id uuid,
    latitude numeric(19,4),
    longitude numeric(19,4),
    status varchar(64)
);
create index ix_location_tenant on location (tenant_id, created_at);
create index ix_location_site_id on location (tenant_id, site_id);
create index ix_location_parent_id on location (tenant_id, parent_id);
create index ix_location_status on location (tenant_id, status);

create table app_user (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    full_name varchar(255),
    email varchar(255),
    role varchar(64),
    organization_id uuid,
    site_id uuid,
    customer_id uuid,
    job_title varchar(255),
    phone varchar(255),
    language varchar(64),
    mfa_enabled boolean,
    status varchar(64),
    last_login_at timestamp with time zone,
    password_hash varchar(255)
);
create index ix_app_user_tenant on app_user (tenant_id, created_at);
create index ix_app_user_organization_id on app_user (tenant_id, organization_id);
create index ix_app_user_site_id on app_user (tenant_id, site_id);
create index ix_app_user_customer_id on app_user (tenant_id, customer_id);
create index ix_app_user_status on app_user (tenant_id, status);

create table delegation (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    delegator_id uuid,
    delegate_id uuid,
    permission varchar(64),
    valid_from timestamp with time zone,
    valid_to timestamp with time zone,
    reason varchar(8000),
    reviewer_id uuid,
    status varchar(64)
);
create index ix_delegation_tenant on delegation (tenant_id, created_at);
create index ix_delegation_delegator_id on delegation (tenant_id, delegator_id);
create index ix_delegation_delegate_id on delegation (tenant_id, delegate_id);
create index ix_delegation_reviewer_id on delegation (tenant_id, reviewer_id);
create index ix_delegation_status on delegation (tenant_id, status);

create table device (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    user_id uuid,
    name varchar(255),
    platform varchar(64),
    app_version varchar(255),
    last_sync_at timestamp with time zone,
    status varchar(64)
);
create index ix_device_tenant on device (tenant_id, created_at);
create index ix_device_user_id on device (tenant_id, user_id);
create index ix_device_status on device (tenant_id, status);

create table asset (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    tag varchar(255),
    name varchar(255),
    asset_type varchar(64),
    category varchar(255),
    manufacturer varchar(255),
    model varchar(255),
    serial_number varchar(255),
    criticality varchar(64),
    status varchar(64),
    safety_state varchar(64),
    site_id uuid,
    location_id uuid,
    parent_id uuid,
    customer_id uuid,
    owner_org_id uuid,
    custodian varchar(255),
    purchase_date date,
    purchase_cost numeric(19,4),
    commissioned_on date,
    warranty_end date,
    expected_life_years integer,
    external_ref varchar(255),
    notes varchar(8000)
);
create index ix_asset_tenant on asset (tenant_id, created_at);
create index ix_asset_status on asset (tenant_id, status);
create index ix_asset_site_id on asset (tenant_id, site_id);
create index ix_asset_location_id on asset (tenant_id, location_id);
create index ix_asset_parent_id on asset (tenant_id, parent_id);
create index ix_asset_customer_id on asset (tenant_id, customer_id);
create index ix_asset_owner_org_id on asset (tenant_id, owner_org_id);

create table asset_event (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    asset_id uuid,
    event_type varchar(64),
    from_value varchar(255),
    to_value varchar(255),
    reason varchar(8000),
    effective_at timestamp with time zone,
    actor varchar(255)
);
create index ix_asset_event_tenant on asset_event (tenant_id, created_at);
create index ix_asset_event_asset_id on asset_event (tenant_id, asset_id);

create table passport_token (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    asset_id uuid,
    token varchar(255),
    status varchar(64),
    issued_at timestamp with time zone,
    revoked_at timestamp with time zone,
    scan_count integer
);
create index ix_passport_token_tenant on passport_token (tenant_id, created_at);
create index ix_passport_token_asset_id on passport_token (tenant_id, asset_id);
create index ix_passport_token_status on passport_token (tenant_id, status);

create table meter (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    asset_id uuid,
    name varchar(255),
    meter_type varchar(64),
    unit varchar(255),
    last_reading numeric(19,4),
    last_reading_at timestamp with time zone,
    min_value numeric(19,4),
    max_value numeric(19,4),
    status varchar(64)
);
create index ix_meter_tenant on meter (tenant_id, created_at);
create index ix_meter_asset_id on meter (tenant_id, asset_id);
create index ix_meter_status on meter (tenant_id, status);

create table meter_reading (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    meter_id uuid,
    asset_id uuid,
    value numeric(19,4),
    reading_at timestamp with time zone,
    source varchar(64),
    accepted boolean,
    rejection_reason varchar(255),
    note varchar(8000)
);
create index ix_meter_reading_tenant on meter_reading (tenant_id, created_at);
create index ix_meter_reading_meter_id on meter_reading (tenant_id, meter_id);
create index ix_meter_reading_asset_id on meter_reading (tenant_id, asset_id);

create table vehicle (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    asset_id uuid,
    plate_number varchar(255),
    vin varchar(255),
    make varchar(255),
    model varchar(255),
    year integer,
    fuel_type varchar(64),
    odometer_km numeric(19,4),
    driver_name varchar(255),
    insurance_expiry date,
    inspection_expiry date,
    status varchar(64)
);
create index ix_vehicle_tenant on vehicle (tenant_id, created_at);
create index ix_vehicle_asset_id on vehicle (tenant_id, asset_id);
create index ix_vehicle_status on vehicle (tenant_id, status);

create table fuel_log (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    vehicle_id uuid,
    filled_at timestamp with time zone,
    liters numeric(19,4),
    cost numeric(19,4),
    odometer_km numeric(19,4),
    station varchar(255),
    driver_name varchar(255)
);
create index ix_fuel_log_tenant on fuel_log (tenant_id, created_at);
create index ix_fuel_log_vehicle_id on fuel_log (tenant_id, vehicle_id);

create table maintenance_request (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    number varchar(255),
    title varchar(255),
    description varchar(8000),
    asset_id uuid,
    site_id uuid,
    location_id uuid,
    reported_by varchar(255),
    reporter_contact varchar(255),
    priority varchar(64),
    category varchar(64),
    channel varchar(64),
    status varchar(64),
    customer_id uuid,
    work_order_id uuid,
    duplicate_of_id uuid,
    received_at timestamp with time zone,
    acknowledged_at timestamp with time zone,
    triage_note varchar(8000)
);
create index ix_maintenance_request_tenant on maintenance_request (tenant_id, created_at);
create index ix_maintenance_request_number on maintenance_request (tenant_id, number);
create index ix_maintenance_request_asset_id on maintenance_request (tenant_id, asset_id);
create index ix_maintenance_request_site_id on maintenance_request (tenant_id, site_id);
create index ix_maintenance_request_location_id on maintenance_request (tenant_id, location_id);
create index ix_maintenance_request_status on maintenance_request (tenant_id, status);
create index ix_maintenance_request_customer_id on maintenance_request (tenant_id, customer_id);
create index ix_maintenance_request_work_order_id on maintenance_request (tenant_id, work_order_id);
create index ix_maintenance_request_duplicate_of_id on maintenance_request (tenant_id, duplicate_of_id);
create unique index ux_maintenance_request_number on maintenance_request (tenant_id, number);

create table work_order (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    number varchar(255),
    title varchar(255),
    description varchar(8000),
    work_type varchar(64),
    priority varchar(64),
    status varchar(64),
    previous_status varchar(255),
    asset_id uuid,
    asset_snapshot varchar(8000),
    site_id uuid,
    location_id uuid,
    request_id uuid,
    pm_plan_id uuid,
    parent_work_order_id uuid,
    customer_id uuid,
    contract_id uuid,
    assignee_id uuid,
    planned_start timestamp with time zone,
    planned_end timestamp with time zone,
    due_at timestamp with time zone,
    estimated_hours numeric(19,4),
    actual_start timestamp with time zone,
    actual_end timestamp with time zone,
    permit_required boolean,
    permit_id uuid,
    failure_code varchar(255),
    cause_code varchar(255),
    remedy_code varchar(255),
    closeout_code varchar(255),
    completion_notes varchar(8000),
    completed_by varchar(255),
    reviewed_by varchar(255),
    labor_cost numeric(19,4),
    parts_cost numeric(19,4),
    sla_due_at timestamp with time zone,
    sla_breached boolean,
    hold_reason varchar(255),
    cancel_reason varchar(255)
);
create index ix_work_order_tenant on work_order (tenant_id, created_at);
create index ix_work_order_number on work_order (tenant_id, number);
create index ix_work_order_status on work_order (tenant_id, status);
create index ix_work_order_asset_id on work_order (tenant_id, asset_id);
create index ix_work_order_site_id on work_order (tenant_id, site_id);
create index ix_work_order_location_id on work_order (tenant_id, location_id);
create index ix_work_order_request_id on work_order (tenant_id, request_id);
create index ix_work_order_pm_plan_id on work_order (tenant_id, pm_plan_id);
create index ix_work_order_parent_work_order_id on work_order (tenant_id, parent_work_order_id);
create index ix_work_order_customer_id on work_order (tenant_id, customer_id);
create index ix_work_order_contract_id on work_order (tenant_id, contract_id);
create index ix_work_order_assignee_id on work_order (tenant_id, assignee_id);
create index ix_work_order_permit_id on work_order (tenant_id, permit_id);
create unique index ux_work_order_number on work_order (tenant_id, number);

create table work_task (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    work_order_id uuid,
    sequence integer,
    description varchar(255),
    required boolean,
    status varchar(64),
    result varchar(8000),
    measured_value varchar(255),
    completed_by varchar(255),
    completed_at timestamp with time zone
);
create index ix_work_task_tenant on work_task (tenant_id, created_at);
create index ix_work_task_work_order_id on work_task (tenant_id, work_order_id);
create index ix_work_task_status on work_task (tenant_id, status);

create table pm_plan (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    number varchar(255),
    code varchar(255),
    name varchar(255),
    asset_id uuid,
    site_id uuid,
    trigger_type varchar(64),
    interval_value integer,
    interval_unit varchar(64),
    schedule_mode varchar(64),
    anchor_date date,
    time_zone varchar(255),
    due_window_days integer,
    lead_days integer,
    meter_id uuid,
    meter_interval numeric(19,4),
    next_meter_threshold numeric(19,4),
    work_type varchar(64),
    priority varchar(64),
    estimated_hours numeric(19,4),
    task_list varchar(8000),
    plan_version integer,
    status varchar(64),
    next_due_at timestamp with time zone,
    last_generated_at timestamp with time zone
);
create index ix_pm_plan_tenant on pm_plan (tenant_id, created_at);
create index ix_pm_plan_number on pm_plan (tenant_id, number);
create index ix_pm_plan_asset_id on pm_plan (tenant_id, asset_id);
create index ix_pm_plan_site_id on pm_plan (tenant_id, site_id);
create index ix_pm_plan_meter_id on pm_plan (tenant_id, meter_id);
create index ix_pm_plan_status on pm_plan (tenant_id, status);
create unique index ux_pm_plan_number on pm_plan (tenant_id, number);

create table pm_occurrence (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    plan_id uuid,
    plan_version integer,
    occurrence_key varchar(255),
    due_at timestamp with time zone,
    local_due varchar(255),
    work_order_id uuid,
    status varchar(64),
    completed_at timestamp with time zone
);
create index ix_pm_occurrence_tenant on pm_occurrence (tenant_id, created_at);
create index ix_pm_occurrence_plan_id on pm_occurrence (tenant_id, plan_id);
create index ix_pm_occurrence_work_order_id on pm_occurrence (tenant_id, work_order_id);
create index ix_pm_occurrence_status on pm_occurrence (tenant_id, status);

create table technician (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    user_id uuid,
    full_name varchar(255),
    employee_no varchar(255),
    trade varchar(64),
    skills varchar(8000),
    certifications varchar(8000),
    hourly_rate numeric(19,4),
    site_id uuid,
    shift varchar(64),
    availability varchar(64),
    contractor boolean,
    contractor_org_id uuid,
    phone varchar(255)
);
create index ix_technician_tenant on technician (tenant_id, created_at);
create index ix_technician_user_id on technician (tenant_id, user_id);
create index ix_technician_site_id on technician (tenant_id, site_id);
create index ix_technician_contractor_org_id on technician (tenant_id, contractor_org_id);

create table assignment (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    work_order_id uuid,
    technician_id uuid,
    scheduled_start timestamp with time zone,
    scheduled_end timestamp with time zone,
    role varchar(64),
    status varchar(64),
    note varchar(8000)
);
create index ix_assignment_tenant on assignment (tenant_id, created_at);
create index ix_assignment_work_order_id on assignment (tenant_id, work_order_id);
create index ix_assignment_technician_id on assignment (tenant_id, technician_id);
create index ix_assignment_status on assignment (tenant_id, status);

create table time_entry (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    work_order_id uuid,
    technician_id uuid,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    hours numeric(19,4),
    rate numeric(19,4),
    cost numeric(19,4),
    labor_type varchar(64),
    approved boolean,
    note varchar(8000)
);
create index ix_time_entry_tenant on time_entry (tenant_id, created_at);
create index ix_time_entry_work_order_id on time_entry (tenant_id, work_order_id);
create index ix_time_entry_technician_id on time_entry (tenant_id, technician_id);

create table inspection_template (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    code varchar(255),
    name varchar(255),
    asset_type varchar(255),
    template_version integer,
    status varchar(64),
    questions varchar(8000),
    pass_threshold integer
);
create index ix_inspection_template_tenant on inspection_template (tenant_id, created_at);
create index ix_inspection_template_status on inspection_template (tenant_id, status);

create table inspection_result (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    template_id uuid,
    asset_id uuid,
    work_order_id uuid,
    inspector varchar(255),
    performed_at timestamp with time zone,
    answers varchar(8000),
    score integer,
    outcome varchar(64),
    defects_found varchar(8000),
    follow_up_work_order_id uuid
);
create index ix_inspection_result_tenant on inspection_result (tenant_id, created_at);
create index ix_inspection_result_template_id on inspection_result (tenant_id, template_id);
create index ix_inspection_result_asset_id on inspection_result (tenant_id, asset_id);
create index ix_inspection_result_work_order_id on inspection_result (tenant_id, work_order_id);
create index ix_inspection_result_follow_up_work_order_id on inspection_result (tenant_id, follow_up_work_order_id);

create table work_permit (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    number varchar(255),
    permit_type varchar(64),
    site_id uuid,
    asset_id uuid,
    work_order_id uuid,
    scope varchar(8000),
    hazards varchar(8000),
    controls varchar(8000),
    isolation_points varchar(8000),
    valid_from timestamp with time zone,
    valid_to timestamp with time zone,
    requested_by varchar(255),
    issued_by varchar(255),
    accepted_by varchar(255),
    status varchar(64),
    revoke_reason varchar(255)
);
create index ix_work_permit_tenant on work_permit (tenant_id, created_at);
create index ix_work_permit_number on work_permit (tenant_id, number);
create index ix_work_permit_site_id on work_permit (tenant_id, site_id);
create index ix_work_permit_asset_id on work_permit (tenant_id, asset_id);
create index ix_work_permit_work_order_id on work_permit (tenant_id, work_order_id);
create index ix_work_permit_status on work_permit (tenant_id, status);
create unique index ux_work_permit_number on work_permit (tenant_id, number);

create table safety_incident (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    number varchar(255),
    title varchar(255),
    severity varchar(64),
    occurred_at timestamp with time zone,
    site_id uuid,
    asset_id uuid,
    description varchar(8000),
    immediate_action varchar(8000),
    reported_by varchar(255),
    status varchar(64)
);
create index ix_safety_incident_tenant on safety_incident (tenant_id, created_at);
create index ix_safety_incident_number on safety_incident (tenant_id, number);
create index ix_safety_incident_site_id on safety_incident (tenant_id, site_id);
create index ix_safety_incident_asset_id on safety_incident (tenant_id, asset_id);
create index ix_safety_incident_status on safety_incident (tenant_id, status);
create unique index ux_safety_incident_number on safety_incident (tenant_id, number);

create table calibration_plan (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    asset_id uuid,
    standard varchar(255),
    interval_months integer,
    tolerance varchar(255),
    last_calibrated_on date,
    next_due_on date,
    provider varchar(255),
    status varchar(64)
);
create index ix_calibration_plan_tenant on calibration_plan (tenant_id, created_at);
create index ix_calibration_plan_asset_id on calibration_plan (tenant_id, asset_id);
create index ix_calibration_plan_status on calibration_plan (tenant_id, status);

create table calibration_event (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    number varchar(255),
    plan_id uuid,
    asset_id uuid,
    scheduled_on date,
    performed_on date,
    performed_by varchar(255),
    reference_standard varchar(255),
    as_found varchar(8000),
    as_left varchar(8000),
    as_found_in_tolerance boolean,
    as_left_in_tolerance boolean,
    certificate_no varchar(255),
    status varchar(64),
    eligibility varchar(64),
    investigation_required boolean,
    approved_by varchar(255)
);
create index ix_calibration_event_tenant on calibration_event (tenant_id, created_at);
create index ix_calibration_event_number on calibration_event (tenant_id, number);
create index ix_calibration_event_plan_id on calibration_event (tenant_id, plan_id);
create index ix_calibration_event_asset_id on calibration_event (tenant_id, asset_id);
create index ix_calibration_event_status on calibration_event (tenant_id, status);
create unique index ux_calibration_event_number on calibration_event (tenant_id, number);

create table compliance_item (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    name varchar(255),
    regulation varchar(255),
    asset_type varchar(255),
    asset_id uuid,
    frequency varchar(64),
    next_due date,
    owner varchar(255),
    status varchar(64),
    evidence_note varchar(8000)
);
create index ix_compliance_item_tenant on compliance_item (tenant_id, created_at);
create index ix_compliance_item_asset_id on compliance_item (tenant_id, asset_id);
create index ix_compliance_item_status on compliance_item (tenant_id, status);

create table downtime_event (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    asset_id uuid,
    work_order_id uuid,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    duration_hours numeric(19,4),
    downtime_type varchar(64),
    failure_mode varchar(255),
    failure_cause varchar(255),
    impact varchar(64),
    status varchar(64)
);
create index ix_downtime_event_tenant on downtime_event (tenant_id, created_at);
create index ix_downtime_event_asset_id on downtime_event (tenant_id, asset_id);
create index ix_downtime_event_work_order_id on downtime_event (tenant_id, work_order_id);
create index ix_downtime_event_status on downtime_event (tenant_id, status);

create table failure_code (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    code varchar(255),
    name varchar(255),
    code_type varchar(64),
    asset_type varchar(255),
    active boolean
);
create index ix_failure_code_tenant on failure_code (tenant_id, created_at);

create table ai_insight (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    asset_id uuid,
    insight_type varchar(64),
    title varchar(255),
    rationale varchar(8000),
    confidence numeric(19,4),
    suggested_action varchar(8000),
    status varchar(64),
    reviewed_by varchar(255),
    reviewed_at timestamp with time zone
);
create index ix_ai_insight_tenant on ai_insight (tenant_id, created_at);
create index ix_ai_insight_asset_id on ai_insight (tenant_id, asset_id);
create index ix_ai_insight_status on ai_insight (tenant_id, status);

create table warehouse (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    code varchar(255),
    name varchar(255),
    site_id uuid,
    kind varchar(64),
    keeper varchar(255),
    status varchar(64)
);
create index ix_warehouse_tenant on warehouse (tenant_id, created_at);
create index ix_warehouse_site_id on warehouse (tenant_id, site_id);
create index ix_warehouse_status on warehouse (tenant_id, status);

create table part (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    part_no varchar(255),
    name varchar(255),
    category varchar(255),
    unit varchar(255),
    manufacturer varchar(255),
    manufacturer_part_no varchar(255),
    unit_cost numeric(19,4),
    reorder_point numeric(19,4),
    reorder_qty numeric(19,4),
    critical_spare boolean,
    preferred_vendor_id uuid,
    barcode varchar(255),
    status varchar(64)
);
create index ix_part_tenant on part (tenant_id, created_at);
create index ix_part_preferred_vendor_id on part (tenant_id, preferred_vendor_id);
create index ix_part_status on part (tenant_id, status);

create table stock_movement (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    part_id uuid,
    warehouse_id uuid,
    movement_type varchar(64),
    quantity numeric(19,4),
    unit_cost numeric(19,4),
    work_order_id uuid,
    reservation_id uuid,
    reference varchar(255),
    client_operation_id varchar(255),
    reason varchar(8000),
    occurred_at timestamp with time zone,
    actor varchar(255)
);
create index ix_stock_movement_tenant on stock_movement (tenant_id, created_at);
create index ix_stock_movement_part_id on stock_movement (tenant_id, part_id);
create index ix_stock_movement_warehouse_id on stock_movement (tenant_id, warehouse_id);
create index ix_stock_movement_work_order_id on stock_movement (tenant_id, work_order_id);
create index ix_stock_movement_reservation_id on stock_movement (tenant_id, reservation_id);

create table stock_reservation (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    part_id uuid,
    warehouse_id uuid,
    work_order_id uuid,
    quantity numeric(19,4),
    issued_qty numeric(19,4),
    status varchar(64),
    client_operation_id varchar(255)
);
create index ix_stock_reservation_tenant on stock_reservation (tenant_id, created_at);
create index ix_stock_reservation_part_id on stock_reservation (tenant_id, part_id);
create index ix_stock_reservation_warehouse_id on stock_reservation (tenant_id, warehouse_id);
create index ix_stock_reservation_work_order_id on stock_reservation (tenant_id, work_order_id);
create index ix_stock_reservation_status on stock_reservation (tenant_id, status);

create table cycle_count (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    warehouse_id uuid,
    part_id uuid,
    counted_qty numeric(19,4),
    system_qty numeric(19,4),
    variance numeric(19,4),
    counted_at timestamp with time zone,
    counted_by varchar(255),
    status varchar(64)
);
create index ix_cycle_count_tenant on cycle_count (tenant_id, created_at);
create index ix_cycle_count_warehouse_id on cycle_count (tenant_id, warehouse_id);
create index ix_cycle_count_part_id on cycle_count (tenant_id, part_id);
create index ix_cycle_count_status on cycle_count (tenant_id, status);

create table customer (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    code varchar(255),
    name varchar(255),
    organization_id uuid,
    industry varchar(64),
    contact_name varchar(255),
    email varchar(255),
    phone varchar(255),
    billing_address varchar(8000),
    tax_id varchar(255),
    payment_terms varchar(255),
    status varchar(64)
);
create index ix_customer_tenant on customer (tenant_id, created_at);
create index ix_customer_organization_id on customer (tenant_id, organization_id);
create index ix_customer_status on customer (tenant_id, status);

create table sla_policy (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    name varchar(255),
    priority varchar(64),
    response_hours numeric(19,4),
    resolution_hours numeric(19,4),
    clock_start varchar(64),
    business_hours_only boolean,
    calendar varchar(255)
);
create index ix_sla_policy_tenant on sla_policy (tenant_id, created_at);

create table service_contract (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    number varchar(255),
    customer_id uuid,
    title varchar(255),
    contract_type varchar(64),
    sla_policy_id uuid,
    start_date date,
    end_date date,
    value numeric(19,4),
    currency varchar(255),
    billing_cycle varchar(64),
    covered_assets varchar(8000),
    auto_renew boolean,
    status varchar(64)
);
create index ix_service_contract_tenant on service_contract (tenant_id, created_at);
create index ix_service_contract_number on service_contract (tenant_id, number);
create index ix_service_contract_customer_id on service_contract (tenant_id, customer_id);
create index ix_service_contract_sla_policy_id on service_contract (tenant_id, sla_policy_id);
create index ix_service_contract_status on service_contract (tenant_id, status);
create unique index ux_service_contract_number on service_contract (tenant_id, number);

create table quote (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    number varchar(255),
    customer_id uuid,
    work_order_id uuid,
    title varchar(255),
    labor_amount numeric(19,4),
    parts_amount numeric(19,4),
    tax_rate numeric(19,4),
    total numeric(19,4),
    currency varchar(255),
    valid_until date,
    status varchar(64),
    approved_by varchar(255),
    approved_at timestamp with time zone,
    notes varchar(8000)
);
create index ix_quote_tenant on quote (tenant_id, created_at);
create index ix_quote_number on quote (tenant_id, number);
create index ix_quote_customer_id on quote (tenant_id, customer_id);
create index ix_quote_work_order_id on quote (tenant_id, work_order_id);
create index ix_quote_status on quote (tenant_id, status);
create unique index ux_quote_number on quote (tenant_id, number);

create table billing_export (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    number varchar(255),
    customer_id uuid,
    contract_id uuid,
    period_start date,
    period_end date,
    work_order_count integer,
    amount numeric(19,4),
    currency varchar(255),
    target_system varchar(64),
    status varchar(64),
    external_ref varchar(255)
);
create index ix_billing_export_tenant on billing_export (tenant_id, created_at);
create index ix_billing_export_number on billing_export (tenant_id, number);
create index ix_billing_export_customer_id on billing_export (tenant_id, customer_id);
create index ix_billing_export_contract_id on billing_export (tenant_id, contract_id);
create index ix_billing_export_status on billing_export (tenant_id, status);
create unique index ux_billing_export_number on billing_export (tenant_id, number);

create table service_signoff (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    work_order_id uuid,
    customer_id uuid,
    signed_by varchar(255),
    signed_at timestamp with time zone,
    rating integer,
    accepted boolean,
    comment varchar(8000)
);
create index ix_service_signoff_tenant on service_signoff (tenant_id, created_at);
create index ix_service_signoff_work_order_id on service_signoff (tenant_id, work_order_id);
create index ix_service_signoff_customer_id on service_signoff (tenant_id, customer_id);

create table vendor (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    code varchar(255),
    name varchar(255),
    category varchar(64),
    contact_name varchar(255),
    email varchar(255),
    phone varchar(255),
    country varchar(255),
    rating integer,
    approved boolean,
    status varchar(64)
);
create index ix_vendor_tenant on vendor (tenant_id, created_at);
create index ix_vendor_status on vendor (tenant_id, status);

create table purchase_requisition (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    number varchar(255),
    part_id uuid,
    description varchar(255),
    quantity numeric(19,4),
    estimated_cost numeric(19,4),
    requested_by varchar(255),
    needed_by date,
    work_order_id uuid,
    status varchar(64)
);
create index ix_purchase_requisition_tenant on purchase_requisition (tenant_id, created_at);
create index ix_purchase_requisition_number on purchase_requisition (tenant_id, number);
create index ix_purchase_requisition_part_id on purchase_requisition (tenant_id, part_id);
create index ix_purchase_requisition_work_order_id on purchase_requisition (tenant_id, work_order_id);
create index ix_purchase_requisition_status on purchase_requisition (tenant_id, status);
create unique index ux_purchase_requisition_number on purchase_requisition (tenant_id, number);

create table purchase_order (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    number varchar(255),
    vendor_id uuid,
    requisition_id uuid,
    part_id uuid,
    quantity numeric(19,4),
    unit_price numeric(19,4),
    total numeric(19,4),
    currency varchar(255),
    order_date date,
    expected_date date,
    warehouse_id uuid,
    received_qty numeric(19,4),
    status varchar(64)
);
create index ix_purchase_order_tenant on purchase_order (tenant_id, created_at);
create index ix_purchase_order_number on purchase_order (tenant_id, number);
create index ix_purchase_order_vendor_id on purchase_order (tenant_id, vendor_id);
create index ix_purchase_order_requisition_id on purchase_order (tenant_id, requisition_id);
create index ix_purchase_order_part_id on purchase_order (tenant_id, part_id);
create index ix_purchase_order_warehouse_id on purchase_order (tenant_id, warehouse_id);
create index ix_purchase_order_status on purchase_order (tenant_id, status);
create unique index ux_purchase_order_number on purchase_order (tenant_id, number);

create table document (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    title varchar(255),
    doc_type varchar(64),
    entity_type varchar(255),
    entity_id varchar(255),
    file_name varchar(255),
    content_type varchar(255),
    size_bytes integer,
    checksum_sha256 varchar(255),
    storage_key varchar(255),
    status varchar(64),
    retention_until date,
    confidential boolean
);
create index ix_document_tenant on document (tenant_id, created_at);
create index ix_document_status on document (tenant_id, status);

create table report_job (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    report_type varchar(64),
    parameters varchar(8000),
    status varchar(64),
    requested_by varchar(255),
    completed_at timestamp with time zone,
    row_count integer
);
create index ix_report_job_tenant on report_job (tenant_id, created_at);
create index ix_report_job_status on report_job (tenant_id, status);

create table integration (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    name varchar(255),
    kind varchar(64),
    endpoint varchar(255),
    auth_type varchar(64),
    status varchar(64),
    last_test_at timestamp with time zone,
    last_test_result varchar(255)
);
create index ix_integration_tenant on integration (tenant_id, created_at);
create index ix_integration_status on integration (tenant_id, status);

create table webhook_subscription (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    url varchar(255),
    event_types varchar(8000),
    secret_hint varchar(255),
    status varchar(64),
    last_delivery_at timestamp with time zone
);
create index ix_webhook_subscription_tenant on webhook_subscription (tenant_id, created_at);
create index ix_webhook_subscription_status on webhook_subscription (tenant_id, status);

create table sensor (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    asset_id uuid,
    name varchar(255),
    sensor_type varchar(64),
    unit varchar(255),
    warn_low numeric(19,4),
    warn_high numeric(19,4),
    alarm_low numeric(19,4),
    alarm_high numeric(19,4),
    last_value numeric(19,4),
    last_seen_at timestamp with time zone,
    status varchar(64),
    gateway varchar(255)
);
create index ix_sensor_tenant on sensor (tenant_id, created_at);
create index ix_sensor_asset_id on sensor (tenant_id, asset_id);
create index ix_sensor_status on sensor (tenant_id, status);

create table sensor_alert (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    sensor_id uuid,
    asset_id uuid,
    severity varchar(64),
    value numeric(19,4),
    threshold numeric(19,4),
    raised_at timestamp with time zone,
    status varchar(64),
    work_order_id uuid
);
create index ix_sensor_alert_tenant on sensor_alert (tenant_id, created_at);
create index ix_sensor_alert_sensor_id on sensor_alert (tenant_id, sensor_id);
create index ix_sensor_alert_asset_id on sensor_alert (tenant_id, asset_id);
create index ix_sensor_alert_status on sensor_alert (tenant_id, status);
create index ix_sensor_alert_work_order_id on sensor_alert (tenant_id, work_order_id);

create table outbox_event (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    event_type varchar(255),
    aggregate_type varchar(255),
    aggregate_id varchar(255),
    status varchar(64),
    attempts integer,
    occurred_at timestamp with time zone,
    payload varchar(8000)
);
create index ix_outbox_event_tenant on outbox_event (tenant_id, created_at);
create index ix_outbox_event_status on outbox_event (tenant_id, status);

create table audit_event (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    occurred_at timestamp with time zone,
    actor varchar(255),
    action varchar(255),
    entity_type varchar(255),
    entity_id varchar(255),
    detail varchar(8000)
);
create index ix_audit_event_tenant on audit_event (tenant_id, created_at);

create table setting (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    setting_key varchar(255),
    setting_value varchar(255),
    category varchar(255),
    description varchar(8000)
);
create index ix_setting_tenant on setting (tenant_id, created_at);

create table notification (
    id uuid primary key,
    tenant_id uuid not null,
    version bigint not null default 0,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    created_by varchar(255),
    recipient varchar(255),
    channel varchar(64),
    subject varchar(255),
    body varchar(8000),
    link varchar(255),
    status varchar(64),
    created_on timestamp with time zone
);
create index ix_notification_tenant on notification (tenant_id, created_at);
create index ix_notification_status on notification (tenant_id, status);

create unique index ux_pm_occurrence_key on pm_occurrence (tenant_id, plan_id, plan_version, occurrence_key);
create unique index ux_stock_movement_op on stock_movement (tenant_id, client_operation_id);
create unique index ux_stock_reservation_op on stock_reservation (tenant_id, client_operation_id);
create unique index ux_app_user_email on app_user (email);
create unique index ux_passport_token on passport_token (token);
