#!/bin/sh
set -e
if [ -z "$SSL_PRIMARY_DOMAIN" ]; then
  echo "ERROR: SSL_PRIMARY_DOMAIN is required for the edge container"
  exit 1
fi
PF_PATH="${PGADMIN_WEB_PATH:-pf-7m2xk9qn-dbadmin}"
# strip accidental leading slash (path must be a single segment, no extra slashes)
PF_PATH="${PF_PATH#/}"
# trim whitespace and trailing slashes (typos in .env break nginx matching)
PF_PATH=$(printf '%s' "$PF_PATH" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//;s|/*$||')
export PF_PATH
echo "edge: pgAdmin URL path segment is /${PF_PATH}/ (must match PGADMIN_WEB_PATH in .env)"
sed -e "s/__SSL_PRIMARY_DOMAIN__/${SSL_PRIMARY_DOMAIN}/g" \
    -e "s|__PGADMIN_PATH__|${PF_PATH}|g" \
    /etc/nginx/edge.conf.template > /etc/nginx/nginx.conf
exec nginx -g 'daemon off;'
