# Notification e-mail failures

E-mail is retried 5 times; then the notification's `emailStatus` becomes `FAILED`. In-app
notifications are unaffected.

1. Check SMTP settings: `SPRING_MAIL_HOST`, `SPRING_MAIL_PORT`, `SPRING_MAIL_USERNAME`,
   `SPRING_MAIL_PASSWORD`, `OPES_MAIL_FROM`.
2. Search logs for `E-mail for notification`. The warning includes the SMTP error.
3. Common causes: rotated SMTP password, sender domain not authorized (SPF/DKIM), provider rate limit.
4. After fixing, set affected rows back to `PENDING`:
   `update notification set email_status='PENDING', email_attempts=0 where email_status='FAILED' and created_on > now() - interval '2 days';`
