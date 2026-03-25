#!/bin/bash
set -e

echo "=== Pricefly certbot-init: certificate generation ==="

if [ -z "$SSL_PRIMARY_DOMAIN" ]; then
  echo "ERROR: SSL_PRIMARY_DOMAIN is not set (e.g. pricefly.reikalabs.com)"
  exit 1
fi
if [ -z "$LETSENCRYPT_EMAIL" ]; then
  echo "ERROR: LETSENCRYPT_EMAIL is not set"
  exit 1
fi

mkdir -p /var/lib/letsencrypt
mkdir -p /etc/letsencrypt

CERT_PATH="/etc/letsencrypt/live/${SSL_PRIMARY_DOMAIN}/fullchain.pem"

DOMAIN_ARGS="-d ${SSL_PRIMARY_DOMAIN}"
for d in ${SSL_EXTRA_DOMAINS}; do
  if [ -n "$d" ]; then
    DOMAIN_ARGS="$DOMAIN_ARGS -d ${d}"
  fi
done

if [ -f "$CERT_PATH" ]; then
  if openssl x509 -in "$CERT_PATH" -noout -checkend 86400 2>/dev/null; then
    echo "Valid certificates already exist at $CERT_PATH — skipping."
  else
    echo "Existing certificates invalid/expired. Skipping init; use weekly check or renew later."
  fi
  exit 0
fi

echo "Starting nginx (basic config) for ACME..."
nginx -g "daemon on;"
sleep 2

echo "Requesting certificates: $DOMAIN_ARGS"
# shellcheck disable=SC2086
certbot certonly \
  --webroot \
  --webroot-path=/var/lib/letsencrypt \
  $DOMAIN_ARGS \
  --email "$LETSENCRYPT_EMAIL" \
  --agree-tos \
  --noninteractive \
  --verbose

if [ $? -eq 0 ]; then
  echo "Certificates generated under /etc/letsencrypt/live/${SSL_PRIMARY_DOMAIN}/"
  nginx -s quit
  exit 0
else
  echo "certbot failed"
  nginx -s quit || true
  exit 1
fi
