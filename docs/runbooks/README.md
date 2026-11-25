# Runbooks

| Runbook | Used for |
|---|---|
| [incident.md](incident.md) | API down, 5xx spikes, job failures: first response for any alert |
| [api-latency.md](api-latency.md) | `OpesApiLatencyHigh`, `OpesDbConnectionsSaturated` |
| [webhook-dead-letters.md](webhook-dead-letters.md) | `OpesOutboxBacklog`, `OpesDeadLetters` |
| [email.md](email.md) | `OpesEmailFailures` |
| [scanner.md](scanner.md) | `OpesDocumentsAwaitingScan` |
| [mobile-sync.md](mobile-sync.md) | `OpesSyncRejections`, technician sync complaints |
| [user-lockout.md](user-lockout.md) | `OpesAccountLockouts`, locked users, lost authenticator |
| [restore.md](restore.md) | Backup, point-in-time recovery, restore drills |
| [secret-rotation.md](secret-rotation.md) | Rotating token, database, SMTP, S3 and webhook secrets |
| [personal-data.md](personal-data.md) | Subject access requests and erasure |

Every log line carries `cid=<correlation id>`. A user-facing error shows the same id, so ask the
user for it first and search the logs by it.
