# Implementation status

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

## Remaining constraints
- **Java 25**: the build agents in this environment have JDK 21. Run `mvn -Djava.version=25 verify`
  where JDK 25 is installed; the code uses no version-specific APIs.
- **Native app runtime check**: the mobile app typechecks but has not been run on a device or
  emulator here (none available). Build it with `npx expo run:android` / `run:ios`.
- **Release gates** from spec §15–16 (load tests, backup/restore drills, penetration test) are
  operational activities that happen against a deployed environment.
