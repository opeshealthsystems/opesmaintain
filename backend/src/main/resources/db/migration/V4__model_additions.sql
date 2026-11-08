-- GENERATED: fields added to the model in schema version 4.
alter table app_user add column reset_token_hash varchar(255);
alter table app_user add column reset_token_expires timestamp with time zone;
