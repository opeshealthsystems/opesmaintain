# Native technician app — device test plan (plan item I3)

**Build:** `cd mobile && npm ci && npx expo run:android --variant release` (and `run:ios --configuration Release`),
with `EXPO_PUBLIC_API_URL=https://<staging-domain>`.
**Devices:** one low-end Android (Android 10+, 3 GB RAM), one current Android, one iPhone on the latest iOS.

| # | Test | Expected |
|---|---|---|
| 1 | Sign in as `tech@` | Assigned jobs list loads |
| 2 | **Encryption at rest:** pull `opes-maintain.db` from the app sandbox (adb backup / Xcode container) and open it with `sqlite3` | "file is not a database". The key is in Keystore/Keychain only |
| 3 | Airplane mode → open a job → mark tasks done, record a meter reading, run the labor timer | Each action shows "Saved offline"; queue count rises |
| 4 | Force-quit and reopen while offline | Jobs (last-known) and queue persist |
| 5 | Reconnect | Queue syncs automatically; items show Accepted; the server shows the task as done |
| 6 | Change the same work order on the web, then sync an offline change made before it | Item shows Conflict with the server message |
| 7 | Start a permit-required job while offline | Start is disabled ("online check required") |
| 8 | Admin revokes the device in **Devices**, then sync | 403 "device has been revoked"; the app wipes local data and returns to sign-in |
| 9 | Admin chooses **Sign out everywhere** | The next request returns to sign-in |
| 10 | 72-hour offline window: keep 20 queued operations for 72 h, then sync | All are accepted or explained; nothing is lost |
| 11 | Dark mode, large font (200%), TalkBack/VoiceOver on steps 1–5 | Readable, no clipped buttons, controls announced |

Automated baseline: Android and iOS Hermes bundles build; the same React Native UI passes the offline
→ sync → server-verified end-to-end test (`tools/validation/mobile-e2e.js`).
