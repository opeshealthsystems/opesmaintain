# Incident response

1. **Acknowledge** the alert and open an incident channel. Note the start time.
2. **Check health:** `GET /actuator/health` on the management port (9090). Readiness `DOWN` means the
   database or a dependency is unreachable; check `db` in the health detail.
3. **Check scope:** the Grafana "OPES Maintain — operations" dashboard shows request rate by status,
   p95 latency, job failures and the outbox.
4. **Find the error:** search logs for `ERROR` in the alert window and take the `cid=` value. A
   500 response body carries the same `correlationId`.
5. **Mitigate:**
   - A bad release: roll back to the previous image tag (`kubectl rollout undo deployment/opes-api`).
     Flyway migrations are additive, so the previous version runs against the new schema.
   - Database saturation: see [api-latency.md](api-latency.md).
   - A background job failing for one tenant: the other tenants keep running. Read the stack trace
     for `job=<name> tenant=<code>`.
6. **Communicate** to affected customers if an SLA-relevant outage exceeds 15 minutes.
7. **Close** with a post-incident note: timeline, cause, fix, follow-up actions.
