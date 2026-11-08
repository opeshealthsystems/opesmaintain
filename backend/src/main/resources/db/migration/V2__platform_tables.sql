create table tenant (
    id uuid primary key,
    code varchar(64) not null unique,
    legal_name varchar(255) not null,
    country varchar(64),
    time_zone varchar(64),
    currency varchar(8),
    language varchar(8),
    plan varchar(32),
    status varchar(32),
    max_users integer,
    max_assets integer,
    created_at timestamp with time zone,
    version bigint not null default 0
);

create table number_sequence (
    id uuid primary key,
    tenant_id uuid not null,
    prefix varchar(16) not null,
    next_value bigint not null
);
create unique index ux_number_sequence on number_sequence (tenant_id, prefix);

create table idempotency_record (
    id uuid primary key,
    tenant_id uuid not null,
    scope varchar(128) not null,
    idem_key varchar(255) not null,
    result_id uuid,
    created_at timestamp with time zone
);
create unique index ux_idempotency on idempotency_record (tenant_id, scope, idem_key);

create table sync_operation (
    id uuid primary key,
    tenant_id uuid not null,
    client_operation_id varchar(128) not null,
    device_id varchar(128),
    actor varchar(255),
    operation_type varchar(64),
    outcome varchar(32),
    message varchar(2000),
    result_id uuid,
    received_at timestamp with time zone
);
create unique index ux_sync_operation on sync_operation (tenant_id, client_operation_id);
