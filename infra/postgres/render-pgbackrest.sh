#!/bin/sh
# Renders /etc/pgbackrest/pgbackrest.conf placeholders into /var/lib/pgbackrest/pgbackrest.conf and
# creates the stanza once the cluster exists.
set -e
envsubst < /etc/pgbackrest/pgbackrest.conf > /var/lib/pgbackrest/pgbackrest.conf
export PGBACKREST_CONFIG=/var/lib/pgbackrest/pgbackrest.conf
pgbackrest --stanza=opes stanza-create || echo "pgBackRest stanza-create failed; check backup repository settings" >&2
