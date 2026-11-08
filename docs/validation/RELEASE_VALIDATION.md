# Release validation report — OPES Maintain 1.0.0

**Latest run:** after the production-readiness workstreams A–H. Backend: 23/23 tests on Java 25. Security probe: 198 checks, 0 findings. axe: 0 violations. Page crawl: 177 pages in English (1280 px) and French (390 px), no errors. Load (PostgreSQL): list p95 130 ms, transitions p95 35 ms, 50-op sync 607 ms. Restore drill and mobile E2E: passed.

Run on 8 Nov 2026 against this commit, on Java 25.0.5 LTS (Temurin), PostgreSQL 16 and Chromium.
Each check can be repeated with the scripts in `tools/validation/`.

| Spec gate | Check | Result |
|---|---|---|
| §2.2 Java 25 LTS | `mvn -Djava.version=25 clean verify` on JDK 25.0.5 | **Pass**, 13/13 tests |
| §19 Domain acceptance | Tenant isolation, lifecycle guards, separation of duties, If-Match, ledger, PM and request idempotency, permit SoD, meter acceptance | **Pass** |
| §4 Architecture | ArchUnit layering rules | **Pass** |
| §15.1 Interactive API p95 ≤ 500 ms | 600 list/detail requests at 20 concurrent users (PostgreSQL) | **Pass**: p95 107 ms |
| §15.1 Work-order transition p95 ≤ 1 s | 100 guarded transitions, 10 concurrent | **Pass**: p95 27 ms |
| §15.1 Sync batch (50 ops) ≤ 10 s | 10 batches of 50 operations | **Pass**: p95 433 ms |
| §15.1 Report ≤ 60 s | All 8 report types | **Pass**: p95 25 ms |
| §15.1 Data integrity | 20 retries of one reservation → 1 record; 30 racing reservations for 9 units → 9 accepted, never oversold | **Pass** |
| §15.1 Stress 2–3× | Same suite at 60 concurrent users | **Pass**: list p95 188 ms |
| §15.2 Restore drill | Encrypted dump → restore → row counts for 11 tables, evidence checksums, migration history, tenant ownership, login, API reads, tenant isolation | **Pass**: 11 s end to end (target RTO ≤ 4 h) |
| §16 Security | 189 automated probes: deny-by-default, forged tokens, cross-tenant guessing (reads, writes, export, attachments, search, commands, reports, sync), body tenant id, privilege escalation, customer scope, hash exposure, SQL and CSV injection, malicious upload, path traversal, stack-trace leakage, lost updates, web security headers | **Pass**: 0 findings |
| §14.3 / §15.1 Accessibility | axe-core WCAG 2.0/2.1/2.2 A+AA on 18 primary workflows, light and dark | **Pass**: 0 violations (contrast, target size and accessible-name issues fixed in this pass) |
| §14 UI completeness | Every list, detail, form, board, report and print page as admin (1280 / 1440 / 390 px), technician and customer | **Pass**: no horizontal overflow, no page errors |
| §10 Mobile | Expo app bundles for Android and iOS (Hermes); app driven end to end in Chromium at 390 px: sign-in → job → task recorded **offline** → reconnect → sync **ACCEPTED** → server shows DONE | **Pass** |

## Defects found and fixed during validation
- Technicians could not record meter readings, which blocked mobile meter sync. They are now permitted.
- A muted text color was at 4.36:1 contrast; it is now above 4.5:1.
- Sidebar group headers were below the 24 px minimum target size.
- Two header buttons had accessible names that didn't match their visible text.
- The mobile sync queue counter lagged by up to 3 s.

## Production-readiness additions (verified)
| Area | Evidence |
|---|---|
| TOTP two-step sign-in | RFC 6238 test vectors; login requires a valid code once enrolled; privileged roles are blocked until enrolled when `OPES_MFA_REQUIRED=true` |
| Lockout, revocation | 5 failures → 15-minute lock with indistinguishable responses; `Sign out everywhere` rejects existing tokens (security probe) |
| Production secret guard | Startup fails in production with the development token secret (unit test) |
| Notifications | New request → dispatchers, exactly once through the outbox (integration test); e-mail queue with 5 retries |
| S3 storage | Signature V4 matches AWS's published test vector; round trip through a signed-request server |
| ClamAV | clamd INSTREAM protocol tested against a protocol server; unreachable scanner holds files (never accepts) |
| Metrics | `/actuator/prometheus` exposes domain gauges; 11 alert rules, each with a runbook |
| Anomalies and forecasts | 3σ detector and MTBF forecaster unit-tested; explained insights |
| French | Every module, record, field and status translated; 177 pages crawled in French at 390 px |

## External sign-off kits
- [Penetration test scope](external/penetration-test-scope.md)
- [Screen-reader test script](external/screen-reader-test-script.md)
- [Mobile device test plan](external/mobile-device-test-plan.md)

## Limits of this evidence
- Automated probes and axe scans do not replace an independent penetration test or manual
  screen-reader testing, which the spec still requires before contractual release.
- The mobile UI was executed through React Native Web, which exercises the same components and
  sync logic. Native SQLCipher storage and device APIs need a physical or emulated device
  (no KVM is available in this build environment).
- Performance numbers come from a single 4-core host with the demo dataset. Re-baseline them with
  pilot-sized data.
