# Implementation status

This build delivers a working modular monolith and web application covering all 28 modules.
The items below are deliberate deviations from, or remaining work against, the specification.

## Deviations
- **Java 21** toolchain (spec targets Java 25 LTS). The code uses no 25-only features; raise
  `java.version` in `backend/pom.xml` when the build agents run JDK 25.
- **Authentication** uses a local PBKDF2 + HMAC-signed short-lived token issuer suitable for
  single-tenant on-prem and demo installations. Production SaaS should front the API with a
  Keycloak-compatible OIDC provider (spec §2.2); MFA enforcement is modelled (`mfaEnabled`) but
  delegated to that IdP.
- **Technician mobile** is delivered as a responsive, offline-queueing web app (`/technician`)
  using the spec's sync contract. A React Native/Expo client with SQLCipher storage can reuse the
  same `/mobile/sync` API.
- **AI Maintenance Intelligence** is deterministic and explainable (rule-based with rationale and
  confidence); no ML model is trained. All recommendations require human acceptance.
- **Object storage** uses a local filesystem adapter with checksums and content-type allow-list;
  malware scanning and S3 presigned URLs are integration points.
- **Webhook delivery** marks outbox events delivered and records subscription delivery time; the
  outbound signed HTTP call is not yet executed.
- **Architecture tests** (Spring Modulith/ArchUnit) and contract tests are not yet added; the
  domain invariant suite lives in `backend/src/test`.

## Not yet implemented
- Business-hours SLA calendars (policies store the flag; clocks run on elapsed time).
- DST ambiguity policy selection per plan (ZonedDateTime default resolution is used).
- Load, backup/restore drills and penetration testing (spec §15–16 release gates).
