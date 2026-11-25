# Landing page and self-service company onboarding — plan

Status: **approved 2026-11-24** — D1 instant + 30-day trial · D2 trial + Starter/Professional/Enterprise ("contact us" prices) · D4 English + French · D6 branch + PR. Open: D3 (e-mail service), D5.
Target: https://opesmaintain.com

## 1. Goal

A company that has never heard of OPES Maintain can land on opesmaintain.com, understand what it does,
create its own account, describe its sites and the kinds of assets it owns, and start managing
maintenance — without anyone from OPES doing setup by hand. Existing customers sign in from the same page.

## 2. What already exists (and we build on)

| Need | Already in the platform |
|---|---|
| A company = a tenant | `tenant` table with `plan`, `status`, `max_users`, `max_assets` — strict tenant isolation everywhere |
| Company profile | `organization` (kind `OWNER`, legal name, country, time zone, currency, language, tax id) |
| Sites and buildings | `site`, `location` (building → floor → zone → room) |
| Asset kinds to pick from | `asset.asset_type`: Medical device, HVAC, Electrical, Plumbing, Generator, Vehicle, Production, IT, Laboratory, Building, Other |
| First admin, roles | `app_user` with 13 roles (Admin, Manager, Planner, Dispatcher, Technician, Storekeeper, Safety officer, …) |
| Login, MFA, lockout, password reset | `/api/v1/auth/*`, TOTP MFA (required in production) |
| How a tenant is bootstrapped | `DemoSeeder.tenant(...)` + organization/site/user creation — the onboarding service reuses this logic |

**Missing today:** no public page, no sign-up endpoint, no way to create a company except the demo seeder,
`/` is the logged-in dashboard, and e-mail (SMTP) is not configured on the server.

## 3. User journey

```
opesmaintain.com (landing)
   ├─ "Sign in"            → /login → dashboard
   └─ "Start free trial"   → /signup
                               1. Account   name, work e-mail, password, company name, country, phone
                               2. Verify    6-digit code / link sent by e-mail
                               3. MFA       scan QR in authenticator app (production rule)
                             → /onboarding (wizard, can be left and resumed)
                               4. Company   industry, time zone, currency, language, logo
                               5. Sites     first site (+ optional buildings/areas)
                               6. Assets    tick the asset types you own → for each: rough count,
                                            then "add a few now" (quick table) · "import CSV" · "later"
                               7. Team      invite people with a role (e-mail invite)
                               8. Done      → /dashboard with a "finish setting up" checklist
```

Every wizard step can be skipped; the dashboard checklist keeps nagging until sites, assets and one
preventive-maintenance plan exist.

## 4. Landing page content (`/`)

1. **Hero** — one sentence promise ("Every asset, every work order, every inspection — one system"),
   *Start free trial* and *Sign in* buttons, product screenshot.
2. **Who it is for** — hospitals & clinics · factories & pharma plants · maintenance contractors serving
   several clients · facilities (hotels, schools, offices).
3. **Asset types grid** — the 11 types above with icons (the same list the wizard uses).
4. **What you can do** — asset registry & QR passport · breakdown requests → work orders · preventive
   maintenance calendar · spare-parts stock · permits to work & safety · calibration & compliance ·
   offline technician mobile app · customer portal · KPIs (MTTR, MTBF, availability, PM compliance).
5. **How it works** — 3 steps: create account → add sites & assets → plan and track maintenance.
6. **Pricing** — plans mapped to `max_users` / `max_assets` (see decision D2), free trial.
7. **FAQ, contact, footer** — data hosting, security (MFA, audit trail), support e-mail/WhatsApp.

English and French. Same design tokens as the app (`globals.css`). Fast, server-rendered, SEO metadata.

## 5. Changes — backend (Java)

| # | Change |
|---|---|
| B1 | Migration `V5`: `tenant` + `trial_ends_at`, `industry`, `onboarding_step`, `onboarded_at`, `source`; new tables `signup_request` (hashed code, expiry, attempts) and `user_invitation` (hashed token, role, expiry) |
| B2 | `PublicSignupController` under `/api/v1/public/**` (whitelisted in `AuthFilter`): `POST signup`, `POST signup/verify`, `GET plans` |
| B3 | `TenantProvisioningService`: in one transaction creates tenant (status `TRIAL`), owner organization, admin user, number sequences, audit event — extracted from `DemoSeeder` logic |
| B4 | `OnboardingController` (tenant admin only): `GET/PUT /api/v1/onboarding` state, `POST …/sites`, `POST …/asset-types`, `POST …/assets/bulk`, `POST …/assets/import` (CSV), `POST …/invitations` |
| B5 | `POST /api/v1/public/invitations/accept` — invited user sets password (+ MFA) |
| B6 | Plan limits enforced on create (users, assets) with a clear error; trial expiry → read-only, not deletion |
| B7 | Abuse protection: per-IP rate limit on sign-up, honeypot field, optional Cloudflare Turnstile, block disposable e-mail domains |
| B8 | Tests: provisioning creates an isolated tenant; new tenant cannot see demo tenant (404); limits; expired codes |

## 6. Changes — web (Next.js)

| # | Change |
|---|---|
| W1 | Move the dashboard from `/` to `/dashboard`; update `Shell` links and the post-login redirect |
| W2 | New public pages: `/` (landing), `/signup`, `/signup/verify`, `/invite/[token]`, `/pricing` (section anchor is fine) |
| W3 | `/onboarding` wizard (steps 4–8) with progress bar, resume from `onboarding_step` |
| W4 | Dashboard "Finish setting up" checklist card |
| W5 | Login page: add "Create an account" link |
| W6 | Dev mock (`src/server/*`) gets the same endpoints so `npm run dev` keeps working without Java |

## 7. Infrastructure

- **SMTP** for verification codes and invites (decision D3) → `SPRING_MAIL_*` in `/etc/spring/opesmaintain.env`.
- Optional Cloudflare Turnstile keys.
- Deploy with the existing `opesmaintain-redeploy` after code is on GitHub `main`.

## 8. Phases

| Phase | Scope | Result |
|---|---|---|
| **1** | W1, W2 (landing + signup), B1–B3, W5, SMTP | Companies can discover, sign up, verify and log in to an empty, isolated workspace |
| **2** | B4, W3, W4 | Guided wizard: company, sites, asset types, quick asset entry |
| **3** | B5, CSV import, invitations, B6, B7 | Teams, bulk import, limits, abuse protection |
| **4** | Starter PM templates per asset type, online payment (mobile money / card), plan upgrades | Self-service revenue |

## 9. Phase 1 — delivered

- `/` landing page (EN/FR, dark mode, mobile), `/signup` (form → 6-digit e-mail code → signed in), `/dashboard` (moved from `/`).
- `POST /api/v1/public/signup`, `/signup/verify`, `/signup/resend`, `GET /api/v1/public/plans`; rate-limited with sign-in.
- `V5__self_service_signup.sql`; `TenantProvisioningService` creates tenant (TRIAL, 10 users / 500 assets, 30 days),
  OWNER organization and ADMIN user in one transaction; regional defaults (time zone, currency, language) by country.
- Login page: "Create an account" link; demo shortcuts only on localhost.
- **Production needs SMTP** (`SPRING_MAIL_HOST` …, `OPES_MAIL_FROM`): without it sign-up answers 503 `EMAIL_UNAVAILABLE`.
- Not yet: the Next.js dev mock (`src/server`) has no sign-up endpoints (W6), so sign-up only works against the Java backend.

## 10. Decisions needed

| # | Question | Default proposal |
|---|---|---|
| D1 | Instant access after sign-up, or OPES approves each company first? | Instant, with trial |
| D2 | Plans and limits (users / assets / price) | Trial 30 days · Starter 5 users/250 assets · Professional 25/2,500 · Enterprise custom |
| D3 | E-mail sending service | Brevo or Zoho (free tiers) with `no-reply@opesmaintain.com` |
| D4 | Languages on launch | English + French |
| D5 | Should the demo tenant stay visible as a public "try the demo" account? | No — offer a guided video instead |
| D6 | Code workflow: commit directly to `main`, or branch + pull request? | Branch + PR, deploy after merge |
