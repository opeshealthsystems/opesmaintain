-- Self-service company sign-up (landing page → trial workspace).
alter table tenant add column trial_ends_at timestamp with time zone;
alter table tenant add column industry varchar(64);
alter table tenant add column onboarding_step varchar(32);
alter table tenant add column onboarded_at timestamp with time zone;
alter table tenant add column source varchar(32);

-- Pending sign-ups awaiting e-mail verification. Not tenant-scoped: the tenant does not exist yet.
create table signup_request (
    id uuid primary key,
    email varchar(255) not null,
    full_name varchar(255) not null,
    company_name varchar(255) not null,
    country varchar(8),
    phone varchar(64),
    industry varchar(64),
    plan_interest varchar(32),
    language varchar(8),
    password_hash varchar(255) not null,
    code_hash varchar(64) not null,
    attempts integer not null default 0,
    expires_at timestamp with time zone not null,
    created_at timestamp with time zone not null,
    completed_at timestamp with time zone,
    tenant_id uuid
);
create index ix_signup_request_email on signup_request (email, created_at);
