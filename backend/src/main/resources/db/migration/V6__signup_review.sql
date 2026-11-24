-- Sign-ups can wait for manual review when e-mail verification is not available.
alter table signup_request add column status varchar(32);
update signup_request set status = case when completed_at is null then 'PENDING_CODE' else 'COMPLETED' end;
