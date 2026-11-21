#!/usr/bin/env bash
# Nasazení Nutričního plánovače do Azure. Spouštějte z kořene repozitáře:  ./infra/deploy.sh <skupina-prostředků> [oblast]
# Vyžaduje: Azure CLI (az) přihlášené příkazem `az login`, openssl.
# Tajemství se vygenerují jednou a uloží do souboru .secrets.env (jen pro vás, práva 600; NEVKLÁDEJTE do gitu).
set -euo pipefail

RG="${1:?Použití: $0 <skupina-prostředků> [oblast]}"
LOCATION="${2:-westeurope}"
VERSION="${VERSION:-$(date +%Y%m%d-%H%M%S)}"
SECRETS=".secrets.env"
cd "$(dirname "$0")/.."

command -v az >/dev/null || { echo "Chybí Azure CLI (az)."; exit 1; }
command -v openssl >/dev/null || { echo "Chybí openssl."; exit 1; }

gen() { openssl rand -base64 "$1" | tr -d '/+=\n'; }
if [ ! -f "$SECRETS" ]; then
  umask 077
  {
    echo "SQL_ADMIN_PASSWORD='$(gen 24)Aa1!'"          # splní požadavky Azure na složitost
    echo "JWT_SECRET='$(gen 48)'"
    echo "INTERNAL_API_KEY='$(gen 36)'"
    echo "BOOTSTRAP_ADMIN_PASSWORD='$(gen 15)Aa1!'"
  } > "$SECRETS"
  echo "Vygenerována tajemství do $SECRETS"
fi
# shellcheck disable=SC1090
source "$SECRETS"
# NO_BOOTSTRAP=1 ./infra/deploy.sh ...  -> heslo prvního správce se do konfigurace nepředá (po prvním přihlášení doporučeno)
[ "${NO_BOOTSTRAP:-0}" = "1" ] && BOOTSTRAP_ADMIN_PASSWORD=""

echo "== Skupina prostředků $RG ($LOCATION)"
az group create -n "$RG" -l "$LOCATION" -o none

echo "== Krok 1/3: registr, databáze, prostředí (bez aplikací)"
az deployment group create -g "$RG" -f infra/main.bicep -o none \
  -p sqlAdminPassword="$SQL_ADMIN_PASSWORD" jwtSecret="$JWT_SECRET" internalApiKey="$INTERNAL_API_KEY" \
     bootstrapAdminPassword="$BOOTSTRAP_ADMIN_PASSWORD" deployApps=false

ACR="$(az deployment group show -g "$RG" -n main --query properties.outputs.acrName.value -o tsv)"
echo "== Krok 2/3: sestavení a nahrání obrazů do registru $ACR (verze $VERSION)"
az acr build -r "$ACR" -t "planovac-api:$VERSION" api/
az acr build -r "$ACR" -t "planovac-web:$VERSION" -f web/Dockerfile .

echo "== Krok 3/3: vytvoření aplikací"
az deployment group create -g "$RG" -f infra/main.bicep -o none \
  -p sqlAdminPassword="$SQL_ADMIN_PASSWORD" jwtSecret="$JWT_SECRET" internalApiKey="$INTERNAL_API_KEY" \
     bootstrapAdminPassword="$BOOTSTRAP_ADMIN_PASSWORD" deployApps=true \
     apiImage="planovac-api:$VERSION" webImage="planovac-web:$VERSION"

URL="$(az deployment group show -g "$RG" -n main --query properties.outputs.webUrl.value -o tsv)"
echo
echo "Hotovo. Adresa aplikace: $URL"
if [ -n "$BOOTSTRAP_ADMIN_PASSWORD" ]; then
  echo "První přihlášení: uživatel 'admin', heslo je v souboru $SECRETS (BOOTSTRAP_ADMIN_PASSWORD)."
  echo "Po přihlášení si heslo změňte v Nastavení a příště nasazujte s NO_BOOTSTRAP=1 (viz docs/NASAZENI-AZURE.md)."
fi
echo "První otevření po delší nečinnosti může trvat až minutu (probouzí se databáze)."
