# Locked accounts and lost authenticators

- **Locked account:** 5 failed sign-ins lock an account for 15 minutes. An administrator can open
  the user and choose **Unlock account**. Several lockouts at once (`OpesAccountLockouts`) suggest
  password guessing: check `LOGIN_FAILED` and `ACCOUNT_LOCKED` in the audit trail for source
  patterns and consider blocking at the reverse proxy.
- **Lost phone or authenticator:** verify the person's identity out of band, then choose **Reset
  two-step sign-in**. This also signs them out everywhere. They enrol again at next sign-in.
- **Suspected compromise:** choose **Sign out everywhere**, set the user's status to `SUSPENDED`,
  reset their password, and review their audit trail.
- **Offboarding:** set status to `OFFBOARDED`. Access stops at the next request and the device is
  blocked at its next sync.
