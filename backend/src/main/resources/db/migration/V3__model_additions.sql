-- GENERATED: fields added to the model in schema version 3.
alter table app_user add column mfa_enrolled_at timestamp with time zone;
alter table app_user add column mfa_secret varchar(255);
alter table app_user add column failed_logins integer;
alter table app_user add column locked_until timestamp with time zone;
alter table app_user add column tokens_valid_after timestamp with time zone;
alter table app_user add column email_notifications boolean;
alter table notification add column category varchar(255);
alter table notification add column email_status varchar(64);
alter table notification add column email_attempts integer;
