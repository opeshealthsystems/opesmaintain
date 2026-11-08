# PostgreSQL 16 with pgBackRest for continuous WAL archiving (plan item E1).
FROM postgres:16
RUN apt-get update && apt-get install -y --no-install-recommends pgbackrest gettext-base && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /var/log/pgbackrest /var/lib/pgbackrest && chown -R postgres:postgres /var/log/pgbackrest /var/lib/pgbackrest
# pgbackrest.conf uses ${VAR} placeholders; render them from the container environment at start-up.
COPY render-pgbackrest.sh /docker-entrypoint-initdb.d/00-render-pgbackrest.sh
