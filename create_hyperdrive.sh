#!/usr/bin/env bash
set -e

ENV_FILE=".env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found in the current directory."
  exit 1
fi

# Load variables from .env
export $(grep -v '^#' "$ENV_FILE" | xargs)

if [ -z "$DB_USER" ] || [ -z "$DB_PASS" ] || [ -z "$DB_HOST" ] || [ -z "$DB_NAME" ]; then
  echo "Error: Missing one of DB_USER, DB_PASS, DB_HOST, or DB_NAME in $ENV_FILE."
  exit 1
fi

DB_PORT=${DB_PORT:-5432}

# Use Node.js to safely encode special characters in credentials
ENCODED_USER=$(node -e "console.log(encodeURIComponent(process.env.DB_USER))")
ENCODED_PASS=$(node -e "console.log(encodeURIComponent(process.env.DB_PASS))")

CONN_STRING="postgresql://${ENCODED_USER}:${ENCODED_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=require"

echo "Provisioning Cloudflare Hyperdrive config 'macula-rds-pool'..."

# Execute wrangler using the safely parsed connection string
npx wrangler hyperdrive create macula-rds-pool --connection-string="$CONN_STRING"

echo "Hyperdrive creation complete."
