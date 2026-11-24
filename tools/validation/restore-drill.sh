#!/usr/bin/env bash
# Backup / restore rehearsal (spec §15.2). Takes an encrypted logical backup, restores it into a
# fresh database, starts the application against the restore and verifies row counts, tenant
# scope, authentication, outbox/idempotency state and evidence checksums.
# Usage: tools/validation/restore-drill.sh <jar> <java-bin>   (requires local PostgreSQL superuser via `su postgres`)
set -euo pipefail
JAR=${1:-backend/target/opes-maintain-1.0.0.jar}
JAVA=${2:-java}
SRC=opes_maintain
DST=opes_maintain_restore_$(date +%s)
WORK=$(mktemp -d)
KEY=$(openssl rand -hex 32)
psqlq() { su postgres -c "psql -At -d $1 -c \"$2\""; }
TABLES="work_order asset part stock_movement stock_reservation audit_event outbox_event pm_occurrence idempotency_record app_user document"

start=$(date +%s)
echo "1. Backup (pg_dump custom format, AES-256 encrypted at rest)"
su postgres -c "pg_dump -Fc $SRC" | openssl enc -aes-256-cbc -pbkdf2 -pass pass:$KEY -out $WORK/backup.dump.enc
sha256sum $WORK/backup.dump.enc | cut -c1-16 | sed 's/^/   backup sha256 /'
declare -A before
for t in $TABLES; do before[$t]=$(psqlq $SRC "select count(*) from $t"); done
DOCSUM=$(psqlq $SRC "select coalesce(string_agg(checksum_sha256, ',' order by id),'') from document" | sha256sum | cut -c1-16)

echo "2. Restore into $DST"
su postgres -c "createdb -O opes $DST"
openssl enc -d -aes-256-cbc -pbkdf2 -pass pass:$KEY -in $WORK/backup.dump.enc | su postgres -c "pg_restore -d $DST --no-owner --role=opes"
fail=0
for t in $TABLES; do
  after=$(psqlq $DST "select count(*) from $t")
  [ "$after" = "${before[$t]}" ] && echo "   OK   $t ${before[$t]}" || { echo "   FAIL $t ${before[$t]} -> $after"; fail=1; }
done
[ "$(psqlq $DST "select coalesce(string_agg(checksum_sha256, ',' order by id),'') from document" | sha256sum | cut -c1-16)" = "$DOCSUM" ] && echo "   OK   evidence checksums" || { echo "   FAIL evidence checksums"; fail=1; }
[ "$(psqlq $DST "select count(*) from flyway_schema_history where success")" -ge 1 ] && echo "   OK   migration history" || fail=1
[ "$(psqlq $DST "select count(*) from work_order w where not exists (select 1 from tenant t where t.id = w.tenant_id)")" = 0 ] && echo "   OK   tenant ownership intact" || fail=1

echo "3. Start application on the restored database and verify"
PORT=18099 SPRING_PROFILES_ACTIVE=postgres OPES_DB_URL=jdbc:postgresql://localhost:5432/$DST OPES_JOBS_ENABLED=false OPES_SEED_DEMO=false \
  $JAVA -jar $JAR > $WORK/app.log 2>&1 &
PID=$!
for i in $(seq 1 60); do curl -s -o /dev/null localhost:18099/actuator/health && break; sleep 2; done
TOKEN=$(curl -s localhost:18099/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@opes.demo","password":"OpesDemo2026"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
[ -n "$TOKEN" ] && echo "   OK   authentication configuration" || fail=1
TOTAL=$(curl -s "localhost:18099/api/v1/work-orders?size=1" -H "Authorization: Bearer $TOKEN" | sed -n 's/.*"total":\([0-9]*\).*/\1/p')
ISO=$(curl -s localhost:18099/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@isolation.test","password":"OpesDemo2026"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
ISOTOTAL=$(curl -s "localhost:18099/api/v1/work-orders?size=1" -H "Authorization: Bearer $ISO" | sed -n 's/.*"total":\([0-9]*\).*/\1/p')
[ "$TOTAL" = "${before[work_order]}" ] || [ "$TOTAL" -gt 0 ] && echo "   OK   API serves restored work orders ($TOTAL)" || fail=1
[ "$ISOTOTAL" = "0" ] && echo "   OK   tenant isolation after restore" || { echo "   FAIL tenant isolation"; fail=1; }
REPLAY=$(psqlq $DST "select count(*) from outbox_event where status in ('PENDING','RETRY')")
echo "   INFO outbox events pending re-delivery after restore: $REPLAY (consumers are idempotent by eventId)"
kill $PID; wait $PID 2>/dev/null || true
su postgres -c "dropdb $DST"; rm -rf $WORK
echo "Restore time objective: $(( $(date +%s) - start ))s end-to-end (target RTO ≤ 4h)"
[ $fail = 0 ] && echo "DRILL PASSED" || { echo "DRILL FAILED"; exit 1; }
