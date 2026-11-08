# Penetration test — scope and rules of engagement (plan item I1)

**Target:** staging deployment built from the release tag under test (same images as production).
**Window:** agreed with OPES operations. The tester supplies source IP addresses for monitoring.

## In scope
- Web application `https://<staging-domain>/` (Next.js) and API `/api/v1/**`.
- Authentication: local accounts, TOTP two-step sign-in, lockout, session revocation, OIDC (if enabled).
- Tenant isolation: two tenants are provisioned; the tester gets admin, manager, technician, customer
  and auditor accounts in tenant A and an admin in tenant B. Primary objective: read or change tenant A
  data from tenant B, or another customer's data as a customer user (AT-M02).
- Authorization across all 28 modules (role matrix in `docs/plan/SCREEN_CATALOG.md`, "Write roles").
- File upload and download (malware scanning, content-type checks, path traversal, integrity).
- Offline sync endpoint `/api/v1/mobile/sync/**` (replay, cross-tenant operations, revoked devices).
- Webhook signing and outbound delivery (SSRF via subscription URLs).
- CSV and report exports (formula injection, data leakage).

## Out of scope
- Denial of service and load beyond 50 requests/second.
- Social engineering, physical attacks, third-party SaaS (SMTP provider, cloud object store).
- The management port 9090 is not internet-exposed by design; report if it is reachable.

## Baseline evidence supplied
- `tools/validation/security-probe.mjs`: 198 automated checks, 0 findings at the release commit.
- Threat model: spec §16.2; architecture: `README.md`; API: `contracts/openapi/` and `docs/api/commands.md`.

## Reporting
CVSS 3.1 scores. Critical or high findings block release (spec §15.1) unless an approved exception
with compensating controls is recorded in `docs/validation/`. Retest of fixed findings is included.
