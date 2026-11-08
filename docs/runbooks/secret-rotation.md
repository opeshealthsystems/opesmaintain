# Secret rotation

| Secret | How to rotate | Effect |
|---|---|---|
| `OPES_TOKEN_SECRET` | Set a new 32+ character random value and restart all API pods | Every user is signed out; webhook signing secrets change, so tell receivers |
| Database password | Change it in PostgreSQL, update the secret, then do a rolling restart | None if done in that order |
| SMTP password | Update `SPRING_MAIL_PASSWORD`, then restart | Failed e-mails retry automatically |
| S3 keys | Create a new key pair, update `OPES_STORAGE_S3_ACCESS_KEY` and `OPES_STORAGE_S3_SECRET_KEY`, restart, then disable the old key | None |
| OIDC client | Rotate at the identity provider; JWKS keys are fetched automatically | None |

Generate secrets with `openssl rand -base64 48`. Never commit them; use the platform secret manager.
