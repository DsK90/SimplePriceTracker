#!/usr/bin/env bash
# Rebuild and restart the Pricefly Docker stack with TLS (docker-compose.yml + docker-compose.ssl.yml).
# Preserves named volumes (e.g. Postgres pgdata). Keeps nginx/certbot_conf on disk (rsync excludes it from CI).
# Requires: .env with SSL_PRIMARY_DOMAIN, LETSENCRYPT_EMAIL, etc. Port 80 must be free when certbot-init runs.
set -euo pipefail

cd "$(dirname "$0")"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.ssl.yml)

echo "Stopping stack (volumes preserved)..."
"${COMPOSE[@]}" down --remove-orphans

echo "Pruning Docker builder cache..."
docker builder prune -f

echo "Building images..."
"${COMPOSE[@]}" build --no-cache

echo "Step 1: certbot-init (skips if certs already valid)..."
set +e
"${COMPOSE[@]}" --profile init up certbot-init
CERTBOT_UP_EXIT=$?
set -e

CONTAINER_EXIT=$(docker inspect pricefly_certbot_init --format='{{.State.ExitCode}}' 2>/dev/null || echo "1")

if [ "$CERTBOT_UP_EXIT" -ne 0 ] || [ "$CONTAINER_EXIT" != "0" ]; then
  echo "✗ certbot-init failed (compose exit=$CERTBOT_UP_EXIT, container exit=$CONTAINER_EXIT)"
  echo "Logs: docker logs pricefly_certbot_init"
  exit 1
fi

echo "✓ certbot-init OK"
echo "Step 2: Starting all services..."
"${COMPOSE[@]}" up -d

echo "Step 3: Optional cert check (after certbot container is up)..."
sleep 12
if docker exec pricefly_certbot /usr/local/bin/certbot-check-and-fix.sh 2>/dev/null; then
  echo "✓ cert check finished"
else
  echo "⚠ cert check skipped or certbot still starting"
fi

echo "Done."
