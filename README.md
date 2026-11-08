# OPES Maintain

Enterprise maintenance management platform (CMMS/EAM) for OPES Health Systems, built from
[`docs/OPES_Maintain_Enterprise_Specification_and_Architecture_v1.0.md`](docs/OPES_Maintain_Enterprise_Specification_and_Architecture_v1.0.md).

| Layer | Technology | Location |
|---|---|---|
| Backend | Java 25 LTS, Spring Boot 4.1, Spring Data JPA, Flyway | `backend/` |
| Database | PostgreSQL (production) · H2 in PostgreSQL mode (dev/test) | `backend/src/main/resources/db/migration` |
| Web | Next.js 16, React 19, TypeScript, Lucide icons | `web/` |
| Mobile | Expo / React Native, SQLCipher offline store | `mobile/` |
| Contracts | Generated OpenAPI 3.1 | `contracts/openapi/` |
| Model / codegen | Single resource model → entities, repositories, controllers, DDL, UI registry, OpenAPI | `tools/codegen/` |

## Quick start (development)

```bash
# 1. Backend (H2 file database, demo data seeded on first start)
cd backend && mvn spring-boot:run          # http://localhost:8080

# 2. Web
cd web && npm install && npm run dev        # http://localhost:3000
```

Sign in with any demo account (password `OpesDemo2026`), for example `admin@opes.demo`,
`manager@opes.demo`, `planner@opes.demo`, `dispatcher@opes.demo`, `tech@opes.demo`,
`stores@opes.demo`, `safety@opes.demo`, `calibration@opes.demo`, `commercial@opes.demo`,
`procurement@opes.demo`, `auditor@opes.demo` (read-only) and `customer@opes.demo` (portal).
A second tenant (`admin@isolation.test`) exists to demonstrate tenant isolation.

### PostgreSQL / Docker

```bash
docker compose -f infra/docker-compose.yml up --build
```

Or run the backend against PostgreSQL directly:
`SPRING_PROFILES_ACTIVE=postgres OPES_DB_URL=jdbc:postgresql://host:5432/opes_maintain OPES_DB_USER=… OPES_DB_PASSWORD=… OPES_TOKEN_SECRET=<32+ chars> java -jar backend/target/opes-maintain-1.0.0.jar`

| Variable | Purpose | Default |
|---|---|---|
| `OPES_TOKEN_SECRET` | HMAC secret for session tokens — **must be set in every non-dev environment** | dev-only value |
| `OPES_DB_URL` / `OPES_DB_USER` / `OPES_DB_PASSWORD` | Database connection | H2 file `./data` |
| `OPES_STORAGE_ROOT` | Evidence/document storage root | `./data/files` |
| `OPES_SEED_DEMO` | Seed demo tenant on an empty database | `true` |
| `OPES_JOBS_ENABLED` | PM generation, SLA, permit/grant expiry, outbox, insights jobs | `true` |
| `OPES_SECURITY_OIDC_JWKS_URI` / `_ISSUER` / `_AUDIENCE` | Accept tokens from an OIDC provider | disabled |
| `OPES_API_URL` (web) | Backend URL proxied under `/api` | `http://localhost:8080` |

## What is implemented

All 28 modules (OM-M01…M28) are available in the web app with list, detail, create/edit forms,
related-record tabs, audit history, CSV export and printable documents. 56 resources are backed
by typed, tenant-scoped entities and REST endpoints. Lifecycle changes go through explicit,
guarded domain commands — see [`docs/api/commands.md`](docs/api/commands.md).

Highlights mapped to the specification:

- **Work-order lifecycle (§6.1)** — DRAFT → … → CLOSED with role guards, required tasks, permit
  revalidation at start, separation of duties at review, stock/time reconciliation before close,
  `ON_HOLD`/resume, cancel with reservation release, reopen as linked follow-up (WO-INV-01…08).
- **Optimistic concurrency** — every update requires `If-Match`; stale writes return `412`.
- **Audit + outbox in one transaction** — every mutation writes an audit event and a versioned
  domain event (`WorkOrderClosed.v1`, …); a dispatcher delivers to webhook subscriptions.
- **Tenant isolation (§11)** — the tenant comes from the authenticated principal only; foreign ids
  return `404`; exports, reports, search and sync use the same policy.
- **Preventive maintenance (§6.4, §13.1)** — versioned plans; calendar arithmetic in the site's
  IANA zone; meter thresholds trigger once; occurrences unique on tenant+plan+version+key.
- **Inventory ledger (§6.5)** — balances derived from signed movements; row-locked reservations;
  idempotent by client operation id; issue/return/adjust/transfer/cycle-count; PO receipts.
- **Safety & calibration (§6.7, §6.8)** — permit-to-work with issuer ≠ requester, suspension/revocation
  holds linked work; out-of-tolerance calibration restricts the instrument and flags investigation.
- **Offline technician app (§10)** — queued operations with client ids, server re-validation,
  outcomes `ACCEPTED/CONFLICT/REJECTED/REQUIRES_ONLINE_REVIEW`, revoked devices blocked.
- **KPIs (§13.3)** — MTTR, MTBF, availability, PM compliance, SLA breach, planned-work ratio, each
  with formula, numerator and denominator.
- **Customer portal (OM-M20)**, QR equipment passport with rotatable tokens (OM-M05), rule-based
  explainable recommendations that require human review (OM-M28), EN/FR shell.

## Tests

```bash
cd backend && mvn test        # invariants, architecture rules, webhooks, OIDC, SLA calendar, scanner
cd mobile && npm install && npm run typecheck
cd web && npm run typecheck && npm run build
```

## Regenerating from the model

Resources are defined once in `tools/codegen/model.py`. After editing it run
`python3 tools/codegen/generate.py`. For a deployed database add a new Flyway migration rather than
editing `V1__baseline_schema.sql`.

## Plan and operations

- Production readiness plan: [`docs/plan/PRODUCTION_READINESS_PLAN.md`](docs/plan/PRODUCTION_READINESS_PLAN.md)
- Every screen, tab, field and action: [`docs/plan/SCREEN_CATALOG.md`](docs/plan/SCREEN_CATALOG.md) (generated by `tools/codegen/catalog.py`)
- Production deployment: `infra/docker-compose.prod.yml` (Caddy TLS) or `infra/k8s/opes-maintain.yaml`; monitoring in `infra/monitoring/`; backups in `infra/backup/`
- Runbooks: [`docs/runbooks/`](docs/runbooks/README.md)

## Validation

See [`docs/validation/RELEASE_VALIDATION.md`](docs/validation/RELEASE_VALIDATION.md). Scripts: `tools/validation/loadtest.mjs`, `restore-drill.sh`, `security-probe.mjs`, `mobile-e2e.js`.

## Known gaps / next steps

See [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md).
