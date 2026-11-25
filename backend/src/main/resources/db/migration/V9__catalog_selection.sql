-- Asset classes each tenant selected from the OPES master catalog during onboarding.
create table tenant_catalog_class (
    id uuid primary key,
    tenant_id uuid not null,
    asset_class_id varchar(32) not null,
    catalog_version varchar(32),
    created_at timestamp with time zone not null,
    constraint uq_tenant_catalog_class unique (tenant_id, asset_class_id)
);
