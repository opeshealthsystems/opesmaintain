# Mobile sync problems

Each queued operation is re-validated online and receives `ACCEPTED`, `CONFLICT`, `REJECTED` or
`REQUIRES_ONLINE_REVIEW`. The technician sees the outcome and the server's message in the sync queue.

- **CONFLICT:** the record changed on the server since the device cached it. The technician reloads
  the job and records again.
- **REJECTED:** a business rule refused the change, for example a task recorded after the work
  order left In progress. The message explains why.
- **REQUIRES_ONLINE_REVIEW:** permit-bound work must be started online.
- **403 "device has been revoked":** the device is marked `REVOKED` in **Devices**. The app wipes its
  local data. Re-register a new device if this was intentional.
- Receipts are stored per `clientOperationId`, so re-sending the same queue is safe.
