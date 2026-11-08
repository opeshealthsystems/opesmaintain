# Outbox backlog and dead letters

Events are delivered at least once with exponential backoff (2^attempts minutes). After 8 failed
attempts an event becomes `DEAD_LETTER`.

1. Open **Event outbox** (`/m/outbox-events`) and filter by status `DEAD_LETTER`.
2. Open **Webhooks** (`/m/webhook-subscriptions`). Check the receiver URL and its `lastDeliveryAt`.
3. Ask the receiver's owner to check their endpoint. They verify
   `X-Opes-Signature: sha256=HMAC_SHA256(secret, X-Opes-Timestamp + "." + body)`. A manager can reveal
   the secret with **Reveal signing secret** (audited).
4. When the receiver is fixed, open each dead-letter event and choose **Requeue delivery**. Receivers
   must be idempotent by `eventId` because delivery can repeat.
5. A growing `pending` backlog with no failures means the dispatcher is not running: check
   `opes_job_failures_total{job="outbox-dispatch"}` and that `OPES_JOBS_ENABLED` is not `false` on
   at least one instance.
