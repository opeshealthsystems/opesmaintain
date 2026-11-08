# Personal data requests

- **Access request:** an administrator opens the user and chooses **Export personal data**. The JSON
  contains the profile, devices, delegations, notifications, technician profile and time entries, and
  the user's own audit events. The export is audited.
- **Erasure:** first set the user to `OFFBOARDED`, then choose **Pseudonymise**. Name, e-mail, phone
  and job title are replaced; credentials and MFA are removed. Audit events and work history keep the
  pseudonym, so records stay intact as required for maintenance and safety evidence (spec §11.3).
