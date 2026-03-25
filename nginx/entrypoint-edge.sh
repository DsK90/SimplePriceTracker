#!/bin/sh
set -e
if [ -z "$SSL_PRIMARY_DOMAIN" ]; then
  echo "ERROR: SSL_PRIMARY_DOMAIN is required for the edge container"
  exit 1
fi
sed "s/__SSL_PRIMARY_DOMAIN__/${SSL_PRIMARY_DOMAIN}/g" /etc/nginx/edge.conf.template > /etc/nginx/nginx.conf
exec nginx -g 'daemon off;'
