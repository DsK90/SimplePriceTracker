#!/bin/bash
set -e

echo "=== Pricefly certbot renewal service ==="

mkdir -p /var/lib/letsencrypt
mkdir -p /etc/letsencrypt
mkdir -p /etc/pricefly

NGINX_SSL_CONTAINER="${NGINX_SSL_CONTAINER:-pricefly_edge}"

cat > /etc/pricefly/letsencrypt.env <<EOF
SSL_PRIMARY_DOMAIN=${SSL_PRIMARY_DOMAIN:-}
SSL_EXTRA_DOMAINS=${SSL_EXTRA_DOMAINS:-}
LETSENCRYPT_EMAIL=${LETSENCRYPT_EMAIL:-}
NGINX_SSL_CONTAINER=${NGINX_SSL_CONTAINER}
EOF
chmod 644 /etc/pricefly/letsencrypt.env

CERT_PATH="/etc/letsencrypt/live/${SSL_PRIMARY_DOMAIN:-}/fullchain.pem"
MAX_WAIT=120
WAIT_COUNT=0

echo "Waiting for certificates (run certbot-init first if needed)..."
while [ -n "$SSL_PRIMARY_DOMAIN" ] && [ ! -f "$CERT_PATH" ]; do
  if [ $WAIT_COUNT -ge $MAX_WAIT ]; then
    echo "Warning: $CERT_PATH not found after ${MAX_WAIT}s — cron still started."
    break
  fi
  if [ $((WAIT_COUNT % 10)) -eq 0 ]; then
    echo "Waiting... (${WAIT_COUNT}s/${MAX_WAIT}s)"
  fi
  sleep 1
  WAIT_COUNT=$((WAIT_COUNT + 1))
done

# Alpine cron: single file /etc/crontabs/root
{
  echo "SHELL=/bin/bash"
  echo "PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin"
  echo ""
  echo "0 0 * * * set -a; . /etc/pricefly/letsencrypt.env; set +a; certbot renew --quiet --webroot --webroot-path=/var/lib/letsencrypt && docker exec \${NGINX_SSL_CONTAINER} nginx -s reload"
  echo "0 3 * * 0 set -a; . /etc/pricefly/letsencrypt.env; set +a; /usr/local/bin/certbot-check-and-fix.sh"
} > /etc/crontabs/root
chmod 600 /etc/crontabs/root

echo "Cron: daily certbot renew + nginx reload; weekly cert check (Sun 03:00)."

exec crond -f
