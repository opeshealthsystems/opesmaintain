-- OPES operator console: support desk, company notes, invoices and in-app announcements. Platform-level (not tenant data).
create table support_ticket (
    id uuid primary key,
    number varchar(32) not null unique,
    tenant_id uuid,
    subject varchar(200) not null,
    requester_name varchar(120),
    requester_email varchar(200),
    requester_phone varchar(40),
    source varchar(16) not null,
    topic varchar(32),
    status varchar(16) not null,
    priority varchar(16) not null,
    assignee varchar(200),
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    resolved_at timestamp with time zone
);
create index ix_support_ticket_status on support_ticket (status, updated_at);
create index ix_support_ticket_tenant on support_ticket (tenant_id);

create table support_ticket_note (
    id uuid primary key,
    ticket_id uuid not null references support_ticket (id),
    author varchar(200) not null,
    body varchar(8000) not null,
    internal boolean not null,
    created_at timestamp with time zone not null
);
create index ix_support_ticket_note_ticket on support_ticket_note (ticket_id, created_at);

create table company_note (
    id uuid primary key,
    tenant_id uuid not null,
    author varchar(200) not null,
    body varchar(4000) not null,
    created_at timestamp with time zone not null
);
create index ix_company_note_tenant on company_note (tenant_id, created_at);

create table platform_invoice (
    id uuid primary key,
    number varchar(32) not null unique,
    tenant_id uuid not null,
    description varchar(500) not null,
    period_start date,
    period_end date,
    amount numeric(19, 2) not null,
    currency varchar(8) not null,
    status varchar(16) not null,
    issued_on date,
    due_on date,
    paid_on date,
    payment_reference varchar(120),
    created_by varchar(200) not null,
    created_at timestamp with time zone not null
);
create index ix_platform_invoice_tenant on platform_invoice (tenant_id, created_at);
create index ix_platform_invoice_status on platform_invoice (status, due_on);

create table platform_announcement (
    id uuid primary key,
    title varchar(160) not null,
    body varchar(2000) not null,
    level varchar(16) not null,
    audience varchar(32) not null,
    starts_at timestamp with time zone not null,
    ends_at timestamp with time zone,
    created_by varchar(200) not null,
    created_at timestamp with time zone not null
);
create index ix_platform_announcement_window on platform_announcement (starts_at, ends_at);
