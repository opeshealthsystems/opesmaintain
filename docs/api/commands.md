# Domain command endpoints

All endpoints are under `/api/v1`, require `Authorization: Bearer <token>` and return the updated
record (or the created record of another resource where noted). Guard failures return `422` with a
stable `code`; authorization failures `403`; stale versions `412`; missing or foreign ids `404`.

| Resource | Command | Roles | Notes |
|---|---|---|---|
| Auth | `POST /auth/login`, `GET /me`, `GET /me/permissions`, `POST /me:change-password` | any | |
| Users | `POST /users/{id}:set-password` | Admin | |
| Tenant | `GET /tenant`, `PATCH /tenant` | Admin to edit | |
| Service grants | `POST /service-grants/{id}:revoke` `{reason}` | Manager | |
| Assets | `POST /assets/{id}:change-status` `{status, reason}` | Manager, Planner | Locked-out assets cannot be set ACTIVE |
| | `POST /assets/{id}:change-safety` `{safetyState, reason}` | Safety officer, Manager | |
| | `POST /assets/{id}:transfer` `{siteId, locationId?, reason}` | Manager | History preserved |
| | `POST /assets/{id}:retire` `{reason, dispose?}` | Manager | Revokes QR tokens |
| | `GET /assets/{id}/tree` | read | Hierarchy |
| Passport | `POST /assets/{id}/passport-tokens`, `POST /passport-tokens/{id}:revoke`, `GET /passport/{token}`, `GET /public/passport/{token}` | Manager/Planner; read; public | Public scan reveals validity only |
| Requests | `:acknowledge`, `:triage {priority?, note?}`, `:reject {reason}`, `:link-duplicate {originalId}`, `:convert {workType?}` | Manager, Dispatcher, Planner | Convert is idempotent |
| Work orders | `GET /work-orders/{id}/transitions` | read | Transitions available to caller |
| | `POST /work-orders/{id}:transition` `{to, reason?, closeoutCode?, completionNotes?}` + `If-Match` | per transition | `ON_HOLD`, `RESUME`, `CANCELLED` included |
| | `POST /work-orders/{id}:reopen` `{reason}` | Manager | Creates linked follow-up |
| | `POST /work-orders/{id}/tasks/{taskId}:record` `{status, result?, measuredValue?}` | Technician | Only while IN_PROGRESS |
| | `GET /work-orders/{id}/costs` | read | Labor + parts |
| PM plans | `POST /pm-plans/{id}:approve|activate|pause|resume|retire|generate`, `GET /pm-plans/{id}/forecast` | Manager, Planner | `generate` returns the work order |
| Inventory | `POST /stock-receipts`, `/stock-reservations`, `/stock-reservations/{id}:issue`, `/stock-reservations/{id}:release`, `/stock-returns`, `/stock-adjustments`, `/stock-transfers`, `/cycle-counts/{id}:post` | Storekeeper, Manager (+Technician/Planner for reserve/issue/return) | `Idempotency-Key` or `clientOperationId` |
| | `GET /parts/{id}/stock`, `GET /warehouses/{id}/stock` | read | |
| Permits | `POST /work-permits/{id}:submit|verify|issue|activate|suspend|resume|close|revoke` | see roles in UI | Requester cannot issue |
| Calibration | `POST /calibration-events/{id}:record-as-found|adjust|record-as-left|review|approve|reject` | Calibration officer, Manager | |
| Quotes | `POST /quotes/{id}:send|approve|reject` | Commercial, Manager, Customer (approve/reject) | |
| Billing | `POST /billing-exports/{id}:generate`, `:set-status {status}` | Commercial, Manager | |
| Procurement | `POST /purchase-requisitions/{id}:submit|approve|reject`, `:convert {vendorId}`, `POST /purchase-orders/{id}:issue|receive|cancel` | Procurement, Manager, Storekeeper (receive) | Receipt posts to stock ledger |
| Reliability | `GET /kpis?days&siteId`, `POST /ai-insights:refresh`, `POST /ai-insights/{id}:accept|reject` | read; Manager, Planner | |
| IoT | `POST /sensors/{id}/readings {value}`, `POST /sensor-alerts/{id}:acknowledge|clear|convert`, `POST /integrations/{id}:test` | Manager, Technician, Planner | Read-only ingestion |
| Documents | `POST /documents/{id}/file` (multipart), `GET /documents/{id}/download`, `GET /reports/{type}?from&to` | writers; read | SHA-256 + allow-listed content types |
| Workspace | `GET /search?q`, `GET /notifications/mine`, `POST /notifications/{id}:read`, `GET /technician/my-work`, `GET /portal/summary` | read | |
| Mobile sync | `POST /mobile/sync/operations`, `GET /mobile/sync/changes?since` | authenticated | Types: TASK_RECORD, WO_TRANSITION, METER_READING, TIME_ENTRY |

Generic resource endpoints (`GET/POST /{resource}`, `GET/PATCH /{resource}/{id}`,
`GET /{resource}/options`, `GET /{resource}/export.csv`) are described in
`contracts/openapi/opes-maintain.openapi.json`.
