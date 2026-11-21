#!/usr/bin/env bash
# Spustí celou aplikaci lokálně BEZ Dockeru a bez databáze (data jsou jen v paměti a po zastavení zmizí):  ./run-local.sh
# Potřebuje JDK 21 a Node.js 20+. Otevřete http://localhost:8080 , přihlášení admin / admin-heslo-12345.
set -euo pipefail
cd "$(dirname "$0")"
./api/build.sh >/dev/null
(cd frontend && node build.js --server >/dev/null)
export INTERNAL_API_KEY="lokalni-interni-klic-aspon-24-znaku"
APP_ENV=development PORT=8081 STORAGE=memory JWT_SECRET="lokalni-jwt-tajemstvi-aspon-32-znaku-dlouhe" \
  BOOTSTRAP_ADMIN_USER=admin BOOTSTRAP_ADMIN_PASSWORD="admin-heslo-12345" \
  java -cp api/out cz.planovac.api.Main &
API_PID=$!
trap 'kill $API_PID 2>/dev/null || true' EXIT
APP_ENV=development PORT=8080 COOKIE_SECURE=false API_URL=http://127.0.0.1:8081 node web/src/index.js
