# Platform audit — November 2026

Scope: authorization and tenant/customer/contractor isolation, workflow integrity, UI coverage per
role, integration security, and consistency between the server policy and the UI. Each finding was
confirmed against the running system before it was fixed. Each fix has an automated regression
check in `backend/src/test/java/com/opesware/maintain/AuditRegressionTest.java`, in
`tools/validation/security-probe.mjs` (section 8), or in both.

## Findings and fixes

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | Critical (safety) | A technician could clear **Permit required** on a work order, bypassing the permit check before work starts | Only managers may remove the requirement, never while the asset is locked out or permit-required; the linked permit cannot change while work is in progress |
| 2 | High | **SSRF**: webhooks could target internal addresses (cloud metadata 169.254.169.254, loopback, private ranges) | `WebhookUrlPolicy`: https only, no credentials in URL, private/loopback/link-local/CGNAT/ULA addresses rejected on save and re-checked before every delivery (DNS rebinding) |
| 3 | High | **Customer isolation**: a customer could attach another customer's asset to a request and then read its label | Reference validation applies the customer scope to referenced records |
| 4 | High | **Service grants not enforced**: contractor (service-provider) users saw every site | `ScopeResolver` + `AccessScope`: contractors see only records at granted sites or on granted assets (lists, reads, references, child records via work order or meter); expired or revoked grants block access at the next request; organization-wide KPIs and reports are refused |
| 5 | High | **Separation of duties bypass by direct edit**: requisition status (skipping approval), time-entry approval, task status, billing-export status, and passport tokens and insights could be created or changed outside their commands | These fields are now server-managed; time approval is a command (`/time-entries/{id}:approve`) that refuses self-approval; passport tokens and insights are created by the domain only |
| 6 | Medium | **Over-broad write roles**: technicians could change their own hourly rate, PM plans, inspection templates and failure codes, and could self-dispatch via assignments | Per-resource write roles narrowed |
| 7 | Medium | **Information disclosure**: technicians could list all notifications (including other roles'), mark others' notifications read, and list the whole staff directory | Notifications and users are restricted to admins, managers and auditors; marking read requires being the recipient |
| 8 | Medium | **Delegations had no effect** (OM-M02-004) | `DelegationService`: active, in-window delegations from active delegators grant approve work, review work, issue permits, approve quotes and approve purchases; every use is audited |
| 9 | Medium | No per-address limit on sign-in (password spraying across many accounts) | `LoginRateLimiter`: 20 sign-in attempts per minute per client address (configurable) |
| 10 | Medium | Password change or reset left other sessions valid | Both revoke other sessions; the user changing their own password receives a fresh token |
| 11 | Medium | Devices were never registered, so device revocation only worked for manually created devices | First sync registers the device for the user; a device registered to another user is refused |
| 12 | Medium | No Content-Security-Policy on the web app | CSP (self-only scripts, connections and frames; `frame-ancestors 'none'`) and HSTS |
| 13 | Low | Sign-in, OIDC and QR scans scanned all users or tokens in memory | Indexed lookups (`findFirstByEmailIgnoreCase`, `findFirstByToken`) |
| 14 | Low | Duplicate customer sign-offs were possible | One accepted sign-off per work order |
| 15 | Low | Oversized uploads returned a generic 500 | 413 `FILE_TOO_LARGE` |
| 16 | Low | CSV export silently truncated at 500 rows | Raised to 5,000 rows |
| 17 | UI gap | Inspections required typing free-text answers | Guided inspection screen (`/inspect`): the template's questions become a Pass / Fail / N/A checklist with notes, computed score and outcome, and required defects on failure |
| 18 | UI inconsistency | Tabs offered to roles that cannot open them: "Users" on sites, customers and organizations for technicians; QR passport, execution and documents tabs for customers; dashboard and analytics for contractors | Related tabs follow the same restricted-resource list as the navigation; customer tab set; contractor dashboard shows scoped open work, and analytics, reports and portal are hidden from contractors |
| 19 | UI inconsistency | Duplicate tab names when a record links through several fields | Tabs are named by the linking field |
| 20 | UI gap | No way to approve labor from the work order | "Approve" on each time entry for supervisors (never their own) |

## Verification
- Backend: 30 tests pass, including the audit regression suite and the rate-limiter test.
- Security probe: 210 checks, 0 findings.
- Role sweep: every sidebar link, the first record of every list, and every tab on that record, for
  12 roles including the new `contractor@opes.demo`. Results are below.

## Open decisions for OPES
- **Site scope for internal staff:** users have a home site, but internal staff are not restricted
  to it (only contractors are scoped). Confirm whether, for example, technicians should see only
  their site.
- **Self-service password reset by e-mail** is not offered; administrators reset passwords. Add it
  once SMTP is configured in production, if wanted.
