# Documents awaiting malware scan

If ClamAV (`OPES_SCAN_CLAMD_HOST`) cannot be reached, uploads stay `SCANNING`. They cannot be
downloaded and are never auto-accepted. A job re-scans them every 30 seconds.

1. Check clamd is reachable: `echo PING | nc <host> 3310` should answer `PONG`.
2. Check the clamd container logs. Signature updates (freshclam) must succeed at least daily.
3. Once clamd answers, held documents move to `ACCEPTED` or `QUARANTINED` automatically.
4. Quarantined files are never served. Investigate the uploader's device if a real detection appears
   in the document's history (`scan` field in the audit detail).
