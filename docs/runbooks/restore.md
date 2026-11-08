# Backup and restore

## Backup design (spec §15.2)
- **Continuous archiving:** PostgreSQL WAL is shipped by pgBackRest to an encrypted repository in a
  separate account (`infra/backup/pgbackrest.conf`), with `archive_timeout = 60s`. This gives
  RPO ≤ 15 minutes (typically about 1 minute).
- **Full backup** weekly, **differential** daily, retained for 4 weekly fulls and 35 days of WAL.
- **Evidence files:** the S3 bucket has versioning and object lock enabled. Documents store their
  SHA-256, so a restore can be checked against object content.

## Point-in-time recovery
1. Stop the API (`kubectl scale deployment/opes-api --replicas=0`) so no new writes arrive.
2. Restore to the target time:
   `pgbackrest --stanza=opes --delta --type=time --target="2026-11-08 09:30:00+00" --target-action=promote restore`
3. Start PostgreSQL. Verify with `select max(occurred_at) from audit_event;`.
4. **Reconcile after restore:**
   - Outbox: events after the restore point are gone; events still `PENDING` will be re-delivered.
     Receivers are idempotent by `eventId`.
   - Idempotency and sync receipts: devices may re-send operations made after the restore point.
     The server accepts them again because their receipts were rolled back. This is intended.
   - Files uploaded after the restore point remain in the bucket but are unreferenced. They are
     harmless and are removed by bucket lifecycle rules.
5. Scale the API back up and run the smoke checks in `tools/validation/restore-drill.sh` step 3.

## Drill
Run `tools/validation/restore-drill.sh` against staging monthly and record the result in
`docs/validation/`. RPO and RTO claims become contractual only after a successful drill.
