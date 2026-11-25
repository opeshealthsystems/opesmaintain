# API latency or database saturation

- **Confirm** which URIs are slow: `topk(5, histogram_quantile(0.95, sum by (le, uri) (rate(http_server_requests_seconds_bucket[5m]))))`.
- **Database:** check `hikaricp_connections_active` against its maximum, and `pg_stat_activity` for long-running
  queries: `select pid, now()-query_start, query from pg_stat_activity where state <> 'idle' order by 2 desc limit 10;`.
- **Scale:** API pods are stateless. Raise HPA `maxReplicas` or the replica count. Raise the pool size
  (`SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE`) only if PostgreSQL `max_connections` allows it.
- **Reports and exports** are excluded from the latency alert. If they are slow, check data volume
  and run them outside peak hours.
- Re-run `node tools/validation/loadtest.mjs <url>` against staging to confirm the fix.
