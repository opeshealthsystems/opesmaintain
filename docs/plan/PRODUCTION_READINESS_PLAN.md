# OPES Maintain — production readiness plan

**Goal:** take the platform from "feature-complete and validated in a build environment" to
"deployable to production and operable by the OPES team". The list of every screen, tab, field and
action is in [`SCREEN_CATALOG.md`](SCREEN_CATALOG.md). It is generated from the code, so it always
matches what is built.

Status key: ✅ done · 🔧 in this plan (built by engineering) · 👤 needs people, a device or an environment

**Current status:** every engineering workstream (A–H) is ✅ and verified. Only the 👤 items in section I remain; each has a hand-off kit.

---

## 1. Product surface (baseline, ✅)

| Surface | Count | Where |
|---|---|---|
| Modules | 28 (OM-M01–M28) | sidebar groups, `/modules` |
| Record types | 56, each with list, detail, new and edit screens | `/m/{resource}` |
| Workflow screens | 18 routes (dashboard, boards, calendar, stock, analytics, reports, print, technician, scan, passport, portal, settings, notifications) | see catalog |
| Domain commands | ~70 guarded lifecycle commands | `docs/api/commands.md` |
| Printable documents | 8 | `/print/{kind}/{id}` |
| Management reports | 8 | `/reports/{type}` |
| Native app | technician app (Expo) | `mobile/` |

### Standard tab layout on every detail page
1. **Details**: every field, with links to referenced records.
2. **Specialist tabs**: Execution & cost (work orders), QR passport and hierarchy (assets),
   forecast (PM plans), stock (parts and warehouses), file (documents).
3. **Documents**: on assets, customers, sites and work orders.
4. **Related-record tabs**: one per incoming link, named by the linking field when several links
   exist (for example "Delegations (delegator)").
5. **History**: the audit trail, for managers and auditors.

### UI standards (apply to every new screen)
- Neutral surfaces, one blue accent, semantic status tints, no glow or gradients, Lucide icons.
- Each screen has loading, empty, error, no-access, stale and offline states where they apply.
- No horizontal page scroll from 390 px to 1440 px; tables scroll inside their own card.
- WCAG 2.2 AA: axe clean in light and dark mode, 24 px minimum targets, visible focus.
- Destructive actions ask for confirmation and a reason; the server returns guard messages verbatim.

---

## 2. End-to-end workflows (all ✅ built; each is covered by the acceptance suite in §5)

| # | Workflow | Path through the product |
|---|---|---|
| W1 | Fault to fix | Request (web, QR, portal) → acknowledge → triage → convert (idempotent) → work order → approve → plan (tasks, hours) → assign (dispatch calendar) → dispatch → start (permit revalidated) → tasks, parts, labor → complete → review (separation of duties) → close (stock and time reconciled, SLA outcome) → customer sign-off → billing export |
| W2 | Preventive maintenance | Plan (calendar or meter) → approve → activate → occurrence generated in site-local time (idempotent) → work order with tasks → close → after-completion plans re-arm |
| W3 | Spare parts | Receive → reserve against work order (row-locked) → issue → return or release → cycle count posts variance → reorder list → requisition → approve → purchase order → receive into ledger |
| W4 | Permit to work | Draft → submit → verify → issue (issuer ≠ requester) → accept and activate in validity window → suspend or revoke (holds linked work) → close or expire |
| W5 | Calibration | Schedule → as-found (out of tolerance restricts the instrument and flags an investigation) → adjust → as-left → review → approve (approver ≠ performer) → plan next due |
| W6 | Asset lifecycle | Register → commission → status and safety changes with reason → transfer between sites (history kept) → retire or dispose (QR tokens revoked) |
| W7 | Commercial | Customer → contract with SLA → quotation → send → customer approves in portal → billing batch → ERP acknowledges, rejects or reverses |
| W8 | Field offline | Technician app caches jobs → records tasks, readings and labor offline → reconnect → server re-validates each operation → accepted, conflict, rejected or needs online review |
| W9 | Condition monitoring | Sensor reading → threshold alert → acknowledge → convert to work order or clear |
| W10 | Recommendations | Rules raise explainable insights → planner accepts or dismisses → audit |
| W11 | Notifications | Domain events raise in-app and e-mail notifications to the right person or role (✅ workstream B) |

---

## 3. Workstreams to production readiness

### A. Identity and access hardening ✅
| Item | Acceptance criteria |
|---|---|
| A1 TOTP multi-factor sign-in for local accounts | Users enrol by scanning a QR code; sign-in then asks for a 6-digit code; enrolment is required for admins, managers and safety and calibration officers when `opes.security.mfa-required=true` |
| A2 Brute-force protection | Account locked for 15 minutes after 5 failed attempts; attempts audited; the response never reveals whether the account exists |
| A3 Session revocation | Suspending or offboarding a user, or an admin "revoke sessions" command, invalidates existing tokens at the next request |
| A4 Production secret guard | Startup fails under the `prod` profile if the token secret is the dev default or shorter than 32 characters |
| A5 API security headers and CORS | API responses carry `nosniff`, `no-store` on authenticated data, and a strict CORS allow-list from configuration |

### B. Notifications ✅
| Item | Acceptance criteria |
|---|---|
| B1 Event-driven notifications | Assignment → technician; request submitted → dispatchers; approval needed → managers; SLA breached → managers; permit awaiting issue → safety officers; quote sent → customer users; low stock → storekeepers; calibration out of tolerance → calibration officers |
| B2 E-mail channel | SMTP via configuration; notifications with an e-mail recipient are sent; a failed send is recorded and retried, never lost silently |
| B3 Notification preferences | Each user can switch e-mail on or off per category in Settings |

### C. Files and scanning ✅
| Item | Acceptance criteria |
|---|---|
| C1 S3-compatible storage adapter | `opes.storage.type=s3` stores evidence in a bucket (AWS, MinIO, Ceph) with SHA-256 checks; filesystem stays the default |
| C2 ClamAV adapter | `opes.scan.clamd.host` streams uploads to clamd; infected files are quarantined; if the scanner is unreachable the file stays in SCANNING and is retried, never auto-accepted |

### D. Observability and operations ✅
| Item | Acceptance criteria |
|---|---|
| D1 Prometheus metrics | `/actuator/prometheus` exposes HTTP latency plus domain gauges: outbox backlog, dead letters, open work orders, SLA breaches, sync outcomes |
| D2 Structured logs with correlation id | Every request gets an `X-Correlation-Id` (reused if supplied), present in logs and error bodies |
| D3 Grafana dashboard and alert rules | Dashboard JSON and Prometheus alert rules for API p95, 5xx rate, dead letters, outbox backlog, DB connections and job failures |
| D4 Runbooks | Incident, restore, secret rotation, webhook dead-letter and user lock-out runbooks |

### E. Data protection and recovery ✅
| Item | Acceptance criteria |
|---|---|
| E1 Point-in-time recovery | WAL archiving and pgBackRest configuration in `infra/`; RPO ≤ 15 min by configuration |
| E2 Restore drill | `tools/validation/restore-drill.sh` (✅) plus a PITR drill procedure in the restore runbook |
| E3 Personal-data export and erasure | Admin command exports one person's personal data, and pseudonymises an offboarded user while keeping the audit trail intact |

### F. Deployment ✅
| Item | Acceptance criteria |
|---|---|
| F1 Production compose | Caddy reverse proxy with automatic TLS, PostgreSQL, API, web; secrets from environment files; health checks |
| F2 Kubernetes manifests | Deployments with readiness and liveness probes, resource limits, an HPA for API and web, Ingress with TLS, NetworkPolicy limiting the database to the API |
| F3 Release pipeline | CI builds and pushes signed images on tags; SBOM generated; dependency audit is a release gate |

### G. Maintenance intelligence ✅
| Item | Acceptance criteria |
|---|---|
| G1 Statistical anomaly detection | Meter and sensor readings beyond 3σ of their own recent history raise an explained `METER_ANOMALY` insight |
| G2 Failure forecasting | Per-asset MTBF from failure history predicts the next likely failure date with a stated sample size; shown on the asset and as an insight when within 14 days |

### H. Localisation ✅
| Item | Acceptance criteria |
|---|---|
| H1 French for every module | Module titles, record names and field labels are translated; the FR toggle changes the whole UI, not only the shell |

### I. External sign-offs 👤
| Item | Who | What we provide |
|---|---|---|
| I1 Penetration test | Independent security firm | [Scope and rules of engagement](../validation/external/penetration-test-scope.md) |
| I2 Manual accessibility test | Screen-reader users (NVDA, JAWS, VoiceOver, TalkBack) | [Test script](../validation/external/screen-reader-test-script.md) |
| I3 Device test of the native app | QA with Android and iOS devices | [Device test plan](../validation/external/mobile-device-test-plan.md) |
| I4 Pilot load sizing | OPES operations with a pilot customer | `tools/validation/loadtest.mjs` re-run with pilot data volumes |
| I5 Production environment | OPES infrastructure | Hosting account, DNS, TLS, SMTP, bucket, backup storage, secrets |

---

## 4. Delivery order
1. A (identity) and B (notifications): user-facing gaps and security.
2. D (observability) and C (storage, scanning): needed before the first deployment.
3. E (recovery) and F (deployment).
4. G (intelligence) and H (localisation).
5. I (external sign-offs) run alongside, once F produces a staging environment.

## 5. Definition of production-ready
- Every 🔧 item meets its acceptance criteria, with automated tests where code changed.
- CI is green: backend tests on Java 25, web build and typecheck, mobile typecheck.
- The release validation suite passes: load, restore drill, security probe, accessibility scan, page
  crawl, mobile end-to-end.
- Runbooks exist for every alert.
- 👤 items have signed results recorded in `docs/validation/`.
