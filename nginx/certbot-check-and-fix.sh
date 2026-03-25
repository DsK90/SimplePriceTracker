#!/bin/bash
set -e

set -a
[ -f /etc/pricefly/letsencrypt.env ] && . /etc/pricefly/letsencrypt.env
set +a

if [ -z "$SSL_PRIMARY_DOMAIN" ] || [ -z "$LETSENCRYPT_EMAIL" ]; then
  echo "[$(date)] certbot-check-and-fix: SSL_PRIMARY_DOMAIN / LETSENCRYPT_EMAIL not set — skip"
  exit 0
fi

CERT_PATH="/etc/letsencrypt/live/${SSL_PRIMARY_DOMAIN}/fullchain.pem"
WEBROOT="/var/lib/letsencrypt"
NGINX_CONTAINER="${NGINX_SSL_CONTAINER:-pricefly_edge}"

DOMAIN_ARGS="-d ${SSL_PRIMARY_DOMAIN}"
for d in ${SSL_EXTRA_DOMAINS}; do
  if [ -n "$d" ]; then
    DOMAIN_ARGS="$DOMAIN_ARGS -d ${d}"
  fi
done

check_cert_valid() {
  if [ ! -f "$CERT_PATH" ]; then
    return 1
  fi
  if openssl x509 -in "$CERT_PATH" -noout -checkend 86400 2>/dev/null; then
    return 0
  fi
  return 1
}

if check_cert_valid; then
  echo "[$(date)] Cert check: OK"
  exit 0
fi

echo "[$(date)] Cert check: invalid — refetching..."

rm -rf /etc/letsencrypt/live /etc/letsencrypt/archive /etc/letsencrypt/renewal

# shellcheck disable=SC2086
if certbot certonly \
  --webroot \
  --webroot-path="$WEBROOT" \
  $DOMAIN_ARGS \
  --email "$LETSENCRYPT_EMAIL" \
  --agree-tos \
  --noninteractive \
  --quiet; then
  echo "[$(date)] New certificates obtained"
  docker exec "$NGINX_CONTAINER" nginx -s reload 2>/dev/null || echo "Could not reload $NGINX_CONTAINER"
else
  echo "[$(date)] certbot certonly failed"
  exit 1
fi
