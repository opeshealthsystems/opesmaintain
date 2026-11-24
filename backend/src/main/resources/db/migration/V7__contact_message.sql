-- Messages sent from the public website contact form. Not tenant-scoped.
create table contact_message (
    id uuid primary key,
    name varchar(120) not null,
    email varchar(200) not null,
    phone varchar(40),
    company varchar(160),
    country varchar(8),
    topic varchar(32),
    language varchar(8),
    message varchar(5000) not null,
    status varchar(16) not null,
    created_at timestamp with time zone not null
);
create index ix_contact_message_status on contact_message (status, created_at);
