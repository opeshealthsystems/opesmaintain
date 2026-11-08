# Implementation status

> The production-readiness plan is in [`plan/PRODUCTION_READINESS_PLAN.md`](plan/PRODUCTION_READINESS_PLAN.md). Engineering workstreams A–H are complete; see the plan for the remaining external sign-offs.

All 28 modules are implemented across the backend, the web app and the native technician app.

## Completed in the second build pass
- **Signed webhook delivery**: real HTTPS POST with `X-Opes-Signature: sha256=HMAC(secret, timestamp.body)`,
  exponential backoff, `DEAD_LETTER` after 8 attempts, manager requeue (`/outbox-events/{id}:requeue`)
  and audited secret reveal (`/webhook-subscriptions/{id}:reveal-secret`).
- **Business-hours SLA clocks**: SLA policies with `businessHoursOnly` use their calendar
  (`MON-FRI 08:00-17:00` by default) in the site's IANA zone.
- **Upload scanning**: content scan (EICAR, executables, scripts, type/magic mismatch) quarantines
  files; a ClamAV/ICAP adapter can replace the `MalwareScanner` bean.
- **OIDC**: set `opes.security.oidc.jwks-uri`, `opes.security.oidc.issuer` and optionally
  `opes.security.oidc.audience` to accept RS256 tokens from Keycloak or another OIDC provider.
  Roles and tenant always come from the OPES membership; MFA is enforced by the IdP.
- **Native technician app** (`mobile/`, Expo development build): SQLCipher-encrypted store with the
  key in the platform keystore, offline queue against `/mobile/sync`, last-known job cache,
  remote wipe on revoked access, light/dark themes.
- **Architecture tests** (ArchUnit) and component tests; 13 backend tests in total.
- **PostgreSQL 16** verified: migrations, full demo seed and API smoke test.

## Policy decisions
- **DST**: calendar PM occurrences fall at 08:00 site-local time. A time in a DST gap moves forward;
  an ambiguous time takes the earlier offset (`java.time.ZonedDateTime` rules). The resolved UTC
  instant and the local representation are both stored.

## Validation
Release gates were executed. Results are in [`validation/RELEASE_VALIDATION.md`](validation/RELEASE_VALIDATION.md).
The project now builds and tests on **Java 25 LTS**.

## Remaining external activities
- An independent penetration test and manual assistive-technology testing (the spec requires
  human sign-off; automated equivalents pass).
- An on-device run of the native app's SQLCipher store (no emulator is available here; the UI and
  sync logic pass end to end via React Native Web).
